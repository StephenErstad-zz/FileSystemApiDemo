/*global describe, it */
'use strict';

(function () {

    var testData = {};

    testData.desiredBytes = 2 * Math.pow(1024, 3);
    testData.testPath = '/test/me/out';
    testData.fileName = testData.testPath + '/' + 'test.txt';
    testData.data = 'Writing a text file for test: ' + (new Date());
    testData.mimeType = 'text/plain';

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

                                expect(false).toBe(true);

                            }
                        );
                    }, function (error) {
                        //Fail if we don't get our quota

                        expect(false).toBe(true);

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

        describe('Quota retrieval', function () {
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

                        expect(false).toBe(true);

                    }
                );
            });
        });

        describe('Creating directories with a DirectoryEntry', function () {
            it('Should create the directory represented by testData.testPath', function () {
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
                                    expect(dirEntry.fullPath).toBe(testData.testPath);

                                }
                            },
                            function (error) {
                                //We have failed in creating all the directories needed.
                                //Note that we may have created some but not all, SCARY!

                                expect(false).toBe(true);

                            });
                    }

                    //We start the recursive process above starting at the given root and with the given path.
                    createSubdirectories(fs.root, testData.testPath);

                });
            });
        });

        describe('Creating files at a given path', function () {
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

                                        expect(false).toBe(true);

                                    };
                                    //Kicking off the write
                                    fileWriter.write(blob);
                                },
								function (error) {
								    //We failed to create the writer for the FileEntry

								    expect(false).toBe(true);

								});
                            },
							function (error) {
							    //Failed to get the file

							    expect(false).toBe(true);

							});
                        }).fail(function (errorDescription) {
                            //Failed to get the directory

                            expect(false).toBe(true);

                        });
                    }).fail(function () {
                        //Failed to confirm the storage

                        expect(false).toBe(true);

                    });
                }).fail(function (error) {
                    //Failed to ensure the file doesn't exist

                    expect(false).toBe(true);

                });

            });
        });

        describe('Reading a file at a given path', function () {
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
                        expect(false).toBe(true);
                    });
                }).fail(function () {
                    //Cry a little if we fail to confirm the storage
                    expect(false).toBe(true);
                });
            })
        });

    });
})();
