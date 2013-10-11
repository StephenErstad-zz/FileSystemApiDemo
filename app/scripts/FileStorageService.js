var fileStorageService = (function fileStorageServiceFactory($) {
    var fileStorageService = function FileStorageService() {
        var me = this;

        //INTERNAL
        var toArray = function (list) {
            return Array.prototype.slice.call(list || [], 0);
        };

        //We need to first request the desired number of bytes for our quota, and upon successful getting our quota request the filesystem 
        var requestFileSystem = function requestFileSystem(requestedBytes) {
            //We are going to use jQuery's implementation of the Future/Promise pattern: http://api.jquery.com/category/deferred-object/
            var reading = $.Deferred();

            //We are going to request persistant storage for our application.  We null coalesce because currently Chrome prefixes the storage, but may not in the future.
            var storage = navigator.persistentStorage || navigator.webkitPersistentStorage;

            //This is what will be used to actually request the filesystem object 
            var request = window.requestFileSystem || window.webkitRequestFileSystem;

            //Request the filesystem after getting the quota
            //Note that a popup will be shown to the user stating the app would like to store "large" files
            //They could reject
            storage.requestQuota(requestedBytes, function (grantedBytes) {
                request(window.PERSISTENT, grantedBytes, function (fs) {
                    //Pass along the filesystem object to callbacks registered to the promise we export
                    reading.resolve(fs);
                }, function (error) {
                    //Fail if we don't get our filesystem
                    reading.reject(fileSystemError(error));
                });
            }, function (error) {
                //Fail if we don't get our quota
                reading.reject(error);
            });

            return reading.promise();
        };

        //Just gets the filesystem error code and gives us a string representation
        var fileSystemError = function (fsError) {
            switch (fsError.code) {
                case FileError.QUOTA_EXCEEDED_ERR:
                    return 'QUOTA_EXCEEDED_ERR';
                case FileError.NOT_FOUND_ERR:
                    return 'NOT_FOUND_ERR';
                case FileError.SECURITY_ERR:
                    return 'SECURITY_ERR';
                case FileError.INVALID_MODIFICATION_ERR:
                    return 'INVALID_MODIFICATION_ERR';
                case FileError.INVALID_STATE_ERR:
                    return 'INVALID_STATE_ERR';
                default:
                    return 'Unknown Error';
            }
        };

        //We initialize the filesystem by giving it our desired quota of 2GB
        var initFileSystem = function () {
            var initiating = $.Deferred();

            requestFileSystem(2 * Math.pow(1024, 3)).done(function (fs) {
                initiating.resolve(fs);
            }).fail(function (error) {
                initiating.reject(error);
            });

            return initiating.promise();
        };

        //Here is a wrapper for the operation we would like to preform on the filesystem.
        //Initializes the filesystem and then does the passed in operation if successful
        var confirmStorage = function (operation) {
            return initFileSystem().done(operation).fail(function (error) {
                console.error('Failed to request FileSystem: ' + error);
            });
        };

        //Create directories in path starting at given root which is a DirectoryEntry object: http://dev.w3.org/2009/dap/file-system/pub/FileSystem/#the-directoryentry-interface       
        var createDirectories = function (root, path) {

            var creating = $.Deferred();

            //Filesystem API will not create subdirectories automatically so we must work our way through the path
            function createSubdirectories(currentDirectory, currentPath) {
                //Split the current path apart by our chosen delimiter
                var folders = currentPath.split('/');

                //Confirm our storage and give it the function we want to preform
                confirmStorage(function (fs) {

                    //If the first item in the folders array is the current directory we ignore it and move on
                    if (folders[0] == '.' || folders[0] == '')
                        folders = folders.slice(1);

                    //We ask to get the directory at the next part of the path, configuring the call to create the directory if it doesn't exist
                    currentDirectory.getDirectory(folders[0], { create: true }, function (dirEntry) {
                        //Upon successfully getting the directory we are given its DirectoryEntry representation                        
                        if (folders.length)
                            //Recursively add the new subfolder (if we still have another to create).
                            createSubdirectories(dirEntry, folders.slice(1).reduce(function (previous, current) {
                                return previous + '/' + current;
                            }));
                        else
                            //We are done so we pass the DirectoryEntry object representing the deepest directory in the original path
                            creating.resolve(dirEntry);
                    }, function (error) {
                        //We have failed in creating all the directories needed.
                        //Note that we may have created some but not all
                        creating.reject(fileSystemError(error));
                    });
                }).fail(function () {
                    creating.reject();
                });
            }

            //If the path is the root we just return root.
            if (path === '' || path === '/')
                creating.resolve(root);
            else
                //We start the recursive process above starting at the given root and with the given path.
                createSubdirectories(root, path);

            return creating.promise();
        };

        //EXTERNAL API
        //Simply gets the total bytes we have available and what we are currently using
        me.requestQuotaUsage = function () {
            var reading = $.Deferred();
            var storage = window.navigator.persistentStorage || window.navigator.webkitPersistentStorage;
			//Get the usage information from the storage
            storage.queryUsageAndQuota(function (used, total) {
				//Pass the usage information to the callbacks hooked up to the promise if sucessful
                reading.resolve({ used: used, total: total });
            }, function (e) {
				//Pass along the pain if the request for usage data fails
                reading.reject(e);
            });
            return reading.promise();
        };

        //We write the file using a string representing the filename which includes the path, the data typically a blob, 
		//and the mime type of the data
        me.writeFile = function (fileName, data, mimeType) {
            var writing = $.Deferred();

            //To avoid collisions we will delete the file if it exists.
			//Might need a more robust (mark your buzzword sheet
            me.deleteFile(fileName).done(function () {

                //We seperate the path and the filename
                var path = fileName.slice(0, fileName.lastIndexOf('/') + 1);
                fileName = fileName.slice(fileName.lastIndexOf('/') + 1);

                //confirm the storage and then do the operation/function passed in
                confirmStorage(function (fs) {
					//We need to ensure that the target directory exists
                    var directoryPromise = createDirectories(fs.root, path);
					
                    directoryPromise.done(function (targetDir) {
						//We use the 
                        targetDir.getFile(fileName, { create: true }, function (fileEntry) {
                            // Create a FileWriter object for our FileEntry (log.txt).
                            fileEntry.createWriter(function (fileWriter) {
                                // Create a new Blob and write it to log.txt.
                                var blob = new Blob([data], { type: mimeType });
								//We have different events we can hook into for FileWriter:
								//Finish writing the file...
                                fileWriter.onwriteend = function () {
                                    writing.resolve(fileEntry);
                                    delete blob;
                                };
								//Progress
                                fileWriter.onprogress = function (progress) {
                                    writing.notify(progress);
                                };
								//Finding out about the bad, bad things
                                fileWriter.onerror = function (e) {
                                    writing.reject();
                                    delete blob;
                                };
								//Kicking off the write
                                fileWriter.write(blob);
                            },
                            function (error) {
								//We failed to create the writer for the FileEntry
                                writing.reject(fileSystemError(error));
                            });
                        },
                        function (error) {
							//Failed to get the file
                            writing.reject(fileSystemError(error));
                        });
                    }).fail(function (errorDescription) {
						//Failed to get the directory
                        writing.reject(errorDescription);
                    });
                }).fail(function () {
					//Failed to confirm the storage
                    writing.reject();
                });
            }).fail(function (error) {
				//Failed to ensure the file doesn't exist
                writing.reject(error);
            });

            return writing.promise();
        };

		//get the file at the given path which includes the filename
		//http://www.w3.org/TR/file-system-api/#the-fileentry-interface
        me.readFile = function (path) {
            var reading = $.Deferred();
			
			//Confirm our storage and give it the function we want to preform
            confirmStorage(function (fs) {
				//Starting at the true root, get the filename in the given path
				//Notice we are saying to NOT create if it does exist
                fs.root.getFile(path, { create: false }, function (fileEntry) {
					//Return the FileEntry object representing the file if we are successful
                    reading.resolve(fileEntry);
                }, function (error) {
					//We failed to get the file...  Depressing
                    var errorDescription = fileSystemError(error);
                    reading.reject(errorDescription);
                });
            }).fail(function () {
				//Cry a little if we fail to confirm the storage
                reading.reject();
            });

            return reading.promise();
        };

		//Read the contents of the directory at the given path
        me.readDirectory = function (path) {
            var reading = $.Deferred();
			//Confirm our storage and give it the function we want to preform
            confirmStorage(function (fs) {
                var dirEntries = [];
				//Get the we desire to read from, stating to not create 
                fs.root.getDirectory(path, { create: false }, function (dirEntry) {
					//We create a DirectoryReader
                    var reader = dirEntry.createReader();
					//We need to setup a function we can call recursively 
					//because the reader may not give us all our Entries with the first call
                    var readEntries = function () {
						//Start reading with the DirectoryReader
                        reader.readEntries(function (results) {
							//Look at results if the read was successful
                            if (!results.length)
								//If there are no Entries in results, we can stop
								//and resolve the promise with the aggregated results
                                reading.resolve(dirEntries);
                            else {
								//If there are Entries in results, we aggregate the results
								//and keep on keeping on by using recursion
                                dirEntries = dirEntries.concat(toArray(results));
                                readEntries();
                            }
                        }, function (error) {
							//We failed to read all the contents of the directory
                            reading.reject(fileSystemError(error));
                        });
                    };
					//Start reading directory
                    readEntries(); 
                }, function (error) {
					//We failed to get the desired directory, maybe it didn't exist
                    reading.reject(fileSystemError(error));
                });

            }).fail(function () {
				//Didn't confirm we have storage...  BAH
                reading.reject();
            });

            return reading.promise();
        };

		//Delete the contents of the directory, but not the directory
        me.deleteDirectoryContent = function (path) {
            var clearing = $.Deferred();
			
			//Confirm our storage and give it the function we want to preform
            confirmStorage(function (fs) {
				
				//Use our readDirectory function to get all of the Entry objects in the directory at the given path
                me.readDirectory(path).done(function (entries) {
					
                    entries.forEach(function (value, index) {
						//Check if the Entry object is a DirectoryEntry
                        if (value.isDirectory)
							//We are a directory so we are going to recursively delete it and all its content
                            value.removeRecursively(function () {
									//We successfully deleted the DirectoryEntry from the filesystem
									console.log('Removed a directory in storage');
								},
                                function () {
									//Something blew up trying to delete the DirectoryEntry
									//We then failed to delete all of the directories content
                                    console.log('Failed to remove a directory in storage');
                                    clearing.reject();
                                });
                        else
							//This is a FileEntry object, so we can delete it like normal
                            value.remove(function () {
								//Successfully deleted the file
                                console.log('Removed a file in storage');
                            },
							function () {
								//Something blew up trying to delete the FileEntry
								//We then failed to delete all of the directories content
								console.log('Failed to remove a file in storage');
								clearing.reject();
                            });
                    });
					
					//We cleared all of the Entry objects in the given directory
					//SUCCESS
                    console.log('Cleared all storage');
                    clearing.resolve('Cleared');
                });
            }).fail(function () {
				//The storage was not confirmed so we pass the buck and let the consumer deal with it
                clearing.reject();
            });

            return clearing.promise();
        };
		
		//Clear all of the content in the filesystem for our domain
        me.clearAllContent = function () {
			//Use our function for deleting a directories content, but use it on the root directory for the domain
            return me.deleteDirectoryContent('/');
        };
		
		//Delete the directory and all its content at the given path
        me.deleteDirectory = function (path) {
            var deleting = $.Deferred();
			
			//Confirm our storage and give it the function we want to preform
			confirmStorage(function (fs) {
				//Get the we desire to delete, stating to not create 
				fs.root.getDirectory(path, { create: false }, function (dirEntry) {
					//Delete the target directory and all its content recursively
					dirEntry.removeRecursively(function () {
						//Success
						deleting.resolve();
					}, function (error) {
						//Failure
						deleting.reject(fileSystemError(error));
					});
				}, function (error) {
					//If the error when getting the directory is that it is not found
					//then we are successful because there is not directory
					if (error.code === FileError.NOT_FOUND_ERR){
						deleting.resolve();
					} else {
						//We have failed to delete the directory
						deleting.reject(fileSystemError(error));
					}
				});
			}).fail(function () {
				//Failed to confirm storage and got no where...
				deleting.reject();
			});
          
            return deleting.promise();
        };

		//Delete the file at the given path from the filesystem
        me.deleteFile = function (path) {
            var deleting = $.Deferred();
			
			//Confirm our storage and give it the function we want to preform
            confirmStorage(function (fs) {
				//Lookup the file at the given path starting at the root of the filesystem
                fs.root.getFile(path, { create: false }, function (fileEntry) {
					//We have found the file at the path
                    fileEntry.remove(function () {
						//Successfully deleted
                        deleting.resolve();
                    }, function (error) {
						//Failed to delete
                        deleting.reject(fileSystemError(error));
                    });
                }, function (error) {
					//If the file was not found at the given path, then we consider it deleted
                    if (error.code === FileError.NOT_FOUND_ERR){
                        deleting.resolve();
                    } else {
						//Failed to get the file 
                        deleting.reject(fileSystemError(error));
					}
                });
            }).fail(function () {
				//Failed to confirm the storage, I blame Sean Dulin, the data, or both
                deleting.reject();
            });

            return deleting.promise();
        };
    };
	//return the constructor
    return fileStorageService;
})();