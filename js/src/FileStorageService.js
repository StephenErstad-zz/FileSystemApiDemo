var fileStorageService = (function fileStorageServiceFactory($) {
    var fileStorageService = function FileStorageService() {
        var me = this;

        //INTERNAL
        var toArray = function (list) {
            return Array.prototype.slice.call(list || [], 0);
        };

        //We need to first request the desired number of bytes for our quota, and upon successful getting our quota request the file system 
        var requestFileSystem = function requestFileSystem(requestedBytes) {
            //We are going to use jQuery's implementation of the Future/Promise pattern: http://api.jquery.com/category/deferred-object/
            var reading = $.Deferred();

            //We are going to request persistant storage for our application.  We null coalesce because currently Chrome prefixes the storage, but may not in the future.
            var storage = navigator.persistentStorage || navigator.webkitPersistentStorage;

            //This is what will be used to actually request the file system object 
            var request = window.requestFileSystem || window.webkitRequestFileSystem;

            //Request the file system after getting the quota
            //Note that a popup will be shown to the user stating the app would like to store "large" files
            //They could reject
            storage.requestQuota(requestedBytes, function (grantedBytes) {
                request(window.PERSISTENT, grantedBytes, function (fs) {
                    //Pass along the file system object to callbacks registered to the promise we export
                    reading.resolve(fs);
                }, function (error) {
                    //Fail if we don't get our file system
                    reading.reject(fileSystemError(error));
                });
            }, function (error) {
                //Fail if we don't get our quota
                reading.reject(error);
            });

            return reading.promise();
        };

        //Just gets the File System error code and gives us a string representation
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

        //We initialize the file system by giving it our desired quota of 2GB
        var initFileSystem = function () {
            var initiating = $.Deferred();

            requestFileSystem(2 * Math.pow(1024, 3)).done(function (fs) {
                initiating.resolve(fs);
            }).fail(function (error) {
                initiating.reject(error);
            });

            return initiating.promise();
        };

        //Here is a wrapper for the operation we would like to preform on the file system.
        //Initializes the file system and then does the passed in operation if successful
        var confirmStorage = function (operation) {
            return initFileSystem().done(operation).fail(function (error) {
                console.error('Failed to request FileSystem: ' + error);
            });
        };

        //Create directories in path starting at given root which is a DirectoryEntry object: http://dev.w3.org/2009/dap/file-system/pub/FileSystem/#the-directoryentry-interface       
        var createDirectories = function (root, path) {

            var creating = $.Deferred();

            //File system API will not create subdirectories automatically so we must work our way through the path
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
            storage.queryUsageAndQuota(function (used, total) {
                reading.resolve({ used: used, total: total });
            }, function (e) {
                reading.reject(e);
            });
            return reading.promise();
        };

        //We write the file using a string representing the filename which includes the path, the data typically a blob, and the mime type of the data
        me.writeFile = function (fileName, data, mimeType) {
            var writing = $.Deferred();

            //To avoid collisions we will delete the file if it exists
            me.deleteFile(fileName).done(function () {

                //We seperate the path and the filename
                var path = fileName.slice(0, fileName.lastIndexOf('/') + 1);
                fileName = fileName.slice(fileName.lastIndexOf('/') + 1);

                //confirm the storage and then do the operation/function passed in
                confirmStorage(function (fs) {
                    var directoryPromise = createDirectories(fs.root, path);
                    directoryPromise.done(function (root) {
                        root.getFile(fileName, { create: true }, function (fileEntry) {
                            // Create a FileWriter object for our FileEntry (log.txt).
                            fileEntry.createWriter(function (fileWriter) {
                                // Create a new Blob and write it to log.txt.
                                var blob = new Blob([data], { type: mimeType });

                                fileWriter.onwriteend = function () {
                                    writing.resolve(fileEntry);
                                    delete blob;
                                };
                                fileWriter.onprogress = function (progress) {
                                    writing.notify(progress);
                                };
                                fileWriter.onerror = function (e) {
                                    writing.reject();
                                    delete blob;
                                };

                                fileWriter.write(blob);
                            },
                            function (error) {
                                writing.reject(fileSystemError(error));
                            });
                        },
                        function (error) {
                            writing.reject(fileSystemError(error));
                        });
                    }).fail(function (errorDescription) {
                        writing.reject(errorDescription);
                    });
                }).fail(function () {
                    writing.reject();
                });
            }).fail(function (error) {
                writing.reject(error);
            });

            return writing;
        };

        me.readFile = function (path) {
            var reading = $.Deferred();

            confirmStorage(function (fs) {
                fs.root.getFile(path, { create: false }, function (fileEntry) {
                    reading.resolve(fileEntry);
                }, function (error) {
                    var errorDescription = fileSystemError(error);
                    reading.reject(errorDescription);
                });
            }).fail(function () {
                reading.reject();
            });

            return reading.promise();
        };

        me.readDirectory = function (path) {
            var reading = $.Deferred();

            confirmStorage(function (fs) {
                var entries = [];
                fs.root.getDirectory(path, { create: false }, function (dirEntry) {
                    var reader = dirEntry.createReader();
                    var readEntries = function () {
                        reader.readEntries(function (results) {
                            if (!results.length)
                                reading.resolve(entries);
                            else {
                                entries = entries.concat(toArray(results));
                                readEntries();
                            }
                        }, function (error) {
                            reading.reject(fileSystemError(error));
                        });
                    };
                    readEntries(); // Start reading dirs.
                }, function (error) {
                    reading.reject(fileSystemError(error));
                });

            }).fail(function () {
                reading.reject();
            });

            return reading.promise();
        };

        me.clearStorage = function () {
            return deleteDirectoryContent('/');
        };

        me.deleteDirectoryContent = function (path) {
            var clearing = $.Deferred();
            confirmStorage(function (fs) {
                me.readDirectory(path).done(function (entries) {
                    entries.forEach(function (value, index) {
                        if (value.isDirectory)
                            value.removeRecursively(function () {
                                console.log('Removed a directory in storage');
                            },
                                function () {
                                    console.log('Failed to remove a directory in storage');
                                    clearing.reject();
                                });
                        else
                            value.remove(function () {
                                console.log('Removed a file in storage');
                            },
                                function () {
                                    console.log('Failed to remove a file in storage');
                                    clearing.reject();
                                });
                    });

                    console.log('Cleared all storage');
                    clearing.resolve('Cleared');
                });
            }).fail(function () {
                clearing.reject();
            });

            return clearing.promise();
        };

        me.deleteDirectory = function (path) {
            var deleting = $.Deferred();
            me.deleteDirectoryContent(path).done(function () {
                confirmStorage(function (fs) {
                    fs.root.getDirectory(path, { create: false }, function (dirEntry) {
                        dirEntry.removeRecursively(function () {
                            deleting.resolve();
                        }, function (error) {
                            deleting.reject(fileSystemError(error));
                        });
                    }, function (error) {
                        if (error.code === FileError.NOT_FOUND_ERR)
                            deleting.resolve();
                        else
                            deleting.reject(fileSystemError(error));
                    });
                }).fail(function () {
                    deleting.reject();
                });
            }).fail(function (error) {
                deleting.reject(error);
            });

            return deleting.promise();
        };

        me.deleteFile = function (path) {
            var deleting = $.Deferred();
            confirmStorage(function (fs) {
                fs.root.getFile(path, { create: false }, function (fileEntry) {
                    fileEntry.remove(function () {
                        deleting.resolve();
                    }, function (error) {
                        deleting.reject(fileSystemError(error));
                    });
                }, function (error) {
                    if (error.code === FileError.NOT_FOUND_ERR)
                        deleting.resolve();
                    else
                        deleting.reject(fileSystemError(error));
                });
            }).fail(function () {
                deleting.reject();
            });

            return deleting.promise();
        };
    };

    return fileStorageService;
})();