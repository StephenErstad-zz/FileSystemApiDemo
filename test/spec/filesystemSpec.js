/*global describe, it */
'use strict';

(function () {

    var testData = {};

    testData.desiredBytes = 2 * Math.pow(1024, 3);
    testData.path = '/test/me/out';
    testData.fileName = testData.path + '/' + 'test.txt';
    testData.data = 'Writing a text file for test: ' + (new Date());
    testData.mimeType = 'text/plain';
    testData.toArray = function (list) {
        return Array.prototype.slice.call(list || [], 0);
    };

    describe('Filesystem API', function () {

        describe('Filesystem API storage', function () {
            it('needs to be requested for a given amount if you want persistent storage', function () {
                
                //We are going to request persistant storage for our application.  We null coalesce because currently Chrome prefixes the storage, but may not in the future.
                var storage = window.navigator.persistentStorage || window.navigator.webkitPersistentStorage;

                //This is what will be used to actually request the filesystem object 
                var request = window.requestFileSystem || window.webkitRequestFileSystem;

                //Request the filesystem after getting the quota
                //Note that a popup will be shown to the user stating the app would like to store "large" files
                //They could reject
                storage.requestQuota(testData.desiredBytes,
                    function (grantedBytes) {
                        request(window.PERSISTENT, grantedBytes,
                            function (fs) {
                                //Pass along the filesystem object to callback

                                expect(fs).toBeTruthy();
                                expect(grantedBytes).toBe(testData.desiredBytes);

                            },
                            function (error) {
                                //Fail if we don't get our filesystem

                                expect(false).toBeTruthy();

                            }
                        );
                    }, function (error) {
                        //Fail if we don't get our quota

                        expect(false).toBeTruthy();

                    });

                //Common errors:
                // EncodingError:  A path or URL supplied to the API was malformed.
                // InvalidModificationError:  The modification requested was illegal. 
                //		Examples of invalid modifications include moving a directory into its own child, moving a file into its parent directory without changing its name, 
                //		or copying a directory to a path occupied by a file.
                // InvalidStateError:  An operation depended on state cached in an interface object, but that state that has changed since it was read from disk.
                // NotFoundError:  A required file or directory could not be found at the time an operation was processed.
                // NotReadableErr:  A required file or directory could be read.
                // NoModificationAllowedError:  The user attempted to write to a file or directory which could not be modified due to the state of the underlying filesystem.
                // PathExistsError:  The user agent failed to create a file or directory due to the existence of a file or directory with the same path.
                // QuotaExceededError:  The operation failed because it would cause the application to exceed its storage quota.
                // SecurityError:	
                // 		A required file was unsafe for access within a Web application
                // 		Too many calls are being made on filesystem resources
                // 		This is a security error code to be used in situations not covered by any other error codes.
                // TypeMismatchError:  The user has attempted to look up a file or directory, 
                //		but the Entry found is of the wrong type [e.g. is a DirectoryEntry when the user requested a FileEntry].

            });
        });

        xdescribe('Quota retrieval', function () {
            it('Should us the total as 2GB', function () {

                //Same as null coalescing because of prefix
                var storage = window.navigator.persistentStorage || window.navigator.webkitPersistentStorage;

                //Get the usage information from the storage
                storage.queryUsageAndQuota(function (used, total) {
                    //Pass the usage information to the callbacks hooked up

                    expect(used).toBeLessThan(total);
                    expect(total).toBe(testData.desiredBytes);

                },
                    function (e) {
                        //Pass along the pain if the request for usage data fails	

                        expect(false).toBeTruthy();

                    }
                );
            });
        });

        xdescribe('Creating directories with a DirectoryEntry', function () {
            it('Should create the directory represented by testData.path', function () {
                var helperService = new FileStorageService();

                helperService.confirmStorage(function (fs) {

                    function createSubdirectories(currentDirectory, currentPath) {
                        //Split the current path apart by our chosen delimiter
                        var folders = currentPath.split('/');

                        //Confirm our storage and give it the function we want to preform

                        //If the first item in the folders array is the current directory we ignore it and move on
                        if (folders[0] == '.' || folders[0] == '')
                            folders = folders.slice(1);

                        //We ask to get the directory at the next part of the path, configuring the call to create the directory if it doesn't exist
                        currentDirectory.getDirectory(folders[0], { create: true },
                            function (dirEntry) {
                                //Upon successfully getting the directory we are given its DirectoryEntry representation                        
                                if (folders.length) {

                                    var nextFolders;

                                    //Recursively add the new subfolder (if we still have another to create).
                                    if (folders.length > 1) {
                                        //Take the current folder off the list
                                        nextFolders = folders.slice(1).reduce(function (previous, current) {
                                            return previous + '/' + current;
                                        });
                                    } else {
                                        //No more folders left
                                        nextFolders = '';
                                    }

                                    createSubdirectories(dirEntry, nextFolders);
                                } else {
                                    //We are done so we pass the DirectoryEntry object representing the deepest directory in the original path

                                    expect(dirEntry).toBeTruthy();
                                    expect(dirEntry.fullPath).toBe(testData.path);

                                }
                            },
                            function (error) {
                                //We have failed in creating all the directories needed.
                                //Note that we may have created some but not all, SCARY!

                                expect(false).toBeTruthy();

                            });
                    }

                    //We start the recursive process above starting at the given root and with the given path.
                    createSubdirectories(fs.root, testData.path);

                });
            });
        });

        xdescribe('Creating files at a given path', function () {
            it('Should create a file in the given path that has a filesystem URL we can reference', function () {
                var helperService = new FileStorageService();



                //To avoid collisions we will delete the file if it exists.
                //Might need a more robust (mark your buzzword sheet
                helperService.deleteFile(testData.fileName).done(function () {

                    //We seperate the path and the filename
                    var path = testData.fileName.slice(0, testData.fileName.lastIndexOf('/') + 1);
                    testData.fileName = testData.fileName.slice(testData.fileName.lastIndexOf('/') + 1);

                    //confirm the storage and then do the operation/function passed in
                    helperService.confirmStorage(function (fs) {
                        //We need to ensure that the target directory exists
                        var directoryPromise = helperService.createDirectories(fs.root, path);

                        directoryPromise.done(function (targetDir) {
                            //We use the 
                            targetDir.getFile(testData.fileName, { create: true }, function (fileEntry) {
                                // Create a FileWriter object for our FileEntry (log.txt).
                                fileEntry.createWriter(function (fileWriter) {
                                    // Create a new Blob
                                    var blob = new Blob([testData.data], { type: testData.mimeType });
                                    //We have different events we can hook into for FileWriter:
                                    //Finish writing the file...
                                    fileWriter.onwriteend = function () {

                                        expect(fileEntry).toBeTruthy();
                                        expect(fileEntry.toURL).toBeTruthy();


                                    };
                                    //Progress
                                    fileWriter.onprogress = function (progress) {
                                        console.log('Writing filename: ' + testData.fileName + ' Total: ' + progress.total);
                                    };
                                    //Finding out about the bad, bad things
                                    fileWriter.onerror = function (e) {

                                        expect(false).toBeTruthy();

                                    };
                                    //Kicking off the write
                                    fileWriter.write(blob);
                                },
								function (error) {
								    //We failed to create the writer for the FileEntry

								    expect(false).toBeTruthy();

								});
                            },
							function (error) {
							    //Failed to get the file

							    expect(false).toBeTruthy();

							});
                        }).fail(function (errorDescription) {
                            //Failed to get the directory

                            expect(false).toBeTruthy();

                        });
                    }).fail(function () {
                        //Failed to confirm the storage

                        expect(false).toBeTruthy();

                    });
                }).fail(function (error) {
                    //Failed to ensure the file doesn't exist

                    expect(false).toBeTruthy();

                });

            });
        });

        xdescribe('Reading a file at a given path', function () {
            it('Should read the file in the given path and give me the FileEntry object it represents', function () {

                var helperService = new FileStorageService();


                //Confirm our storage and give it the function we want to preform
                helperService.confirmStorage(function (fs) {
                    //Starting at the true root, get the filename in the given path
                    //Notice we are saying to NOT create if it does exist
                    fs.root.getFile(testData.fileName, { create: false }, function (fileEntry) {
                        //Return the FileEntry object representing the file if we are successful

                        expect(fileEntry).toBeTruthy();
                        expect(fileEntry.isFile).toBeTruthy();

                    }, function (error) {
                        //We failed to get the file...  Depressing
                        expect(false).toBeTruthy();
                    });
                }).fail(function () {
                    //Cry a little if we fail to confirm the storage
                    expect(false).toBeTruthy();
                });
            })
        });

        xdescribe('Reading a directory\'s contents at a given path', function () {
            it('Should give us a collection of Entry objects in general and a txt file here', function () {
                var helperService = new FileStorageService();
                var testFilePath = testData.path + '/some.json';
                helperService.writeFile(testFilePath, JSON.stringify({
                    root: {
                        name: 'I am test data',
                        children: [{ name: 'Larry' },
                            { name: 'Curly' },
                            { name: 'Moe' }]
                    }
                }), 'application/json').done(function () {

                    helperService.confirmStorage(function (fs) {
                        var dirEntries = [];
                        //Get the we desire to read from, stating to not create 
                        fs.root.getDirectory(testData.path, { create: false }, function (dirEntry) {
                            //We create a DirectoryReader
                            var reader = dirEntry.createReader();
                            //We need to setup a function we can call recursively 
                            //because the reader may not give us all our Entries with the first call
                            var readEntries = function () {
                                //Start reading with the DirectoryReader
                                reader.readEntries(function (results) {
                                    //Look at results if the read was successful
                                    if (!results.length) {
                                        //If there are no Entries in results, we can stop
                                        //and resolve the promise with the aggregated results
                                        //reading.resolve(dirEntries);
                                        dirEntries.forEach(function (item) {
                                            console.log('Read this file from the dir: ' + item.toURL());
                                        });
                                        expect(dirEntries.length).toBeGreaterThan(0);
                                    } else {
                                        //If there are Entries in results, we aggregate the results
                                        //and keep on keeping on by using recursion
                                        dirEntries = dirEntries.concat(testData.toArray(results));
                                        readEntries();
                                    }
                                }, function (error) {
                                    //We failed to read all the contents of the directory
                                    expect(false).toBeTruthy();

                                });
                            };
                            //Start reading directory
                            readEntries();
                        }, function (error) {
                            //We failed to get the desired directory, maybe it didn't exist
                            expect(false).toBeTruthy();

                        });

                    }).fail(function () {
                        //Didn't confirm we have storage...  BAH
                        expect(false).toBeTruthy();

                    });
                });


            });

        });

        xdescribe('Deleteing a directory at a given path', function () {

            it('Should remove the directory and it\'s contents', function () {

                var helperService = new FileStorageService();

                //Confirm our storage and give it the function we want to preform
                helperService.confirmStorage(function (fs) {
                    //Get the we desire to delete, stating to not create 
                    fs.root.getDirectory(testData.path, { create: false }, function (dirEntry) {
                        //Delete the target directory and all its content recursively
                        dirEntry.removeRecursively(function () {
                            //Success
                            expect(true).toBeTruthy();
                        }, function (error) {
                            //Failure
                            expect(false).toBeTruthy();
                        });
                    }, function (error) {
                        //If the error when getting the directory is that it is not found
                        //then we are successful because there is not directory
                        if (error.code === FileError.NOT_FOUND_ERR) {
                            expect(true).toBeTruthy();
                        } else {
                            //We have failed to delete the directory
                            expect(false).toBeTruthy();
                        }
                    });
                }).fail(function () {
                    //Failed to confirm storage and got no where...
                    deleting.reject();
                });

            });

        });

        xdescribe('Deleting a file at a given path', function () {
            it('Should delete the file and nothing else', function () {

                var helperService = new FileStorageService();
                
                //Confirm our storage and give it the function we want to preform
                helperService.confirmStorage(function (fs) {
                    //Lookup the file at the given path starting at the root of the filesystem
                    fs.root.getFile(testData.fileName, { create: false }, function (fileEntry) {
                        //We have found the file at the path
                        fileEntry.remove(function () {
                            //Successfully deleted
                            expect(true).toBeTruthy();
                        }, function (error) {
                            //Failed to delete
                            expect(true).toBeFalsy();
                        });
                    }, function (error) {
                        //If the file was not found at the given path, then we consider it deleted
                        if (error.code === FileError.NOT_FOUND_ERR) {
                            expect(true).toBeTruthy();
                        } else {
                            //Failed to get the file 
                            expect(true).toBeFalsy();
                        }
                    });
                }).fail(function () {
                    //Failed to confirm the storage, I blame Sean Dulin, the data, or both
                    expect(true).toBeFalsy();
                });
            });
        })

    });
})();
