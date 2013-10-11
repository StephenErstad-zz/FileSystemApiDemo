/*global describe, it */
'use strict';

(function () {
    describe('FileStorageService built on the Filesystem API', function () {
    
        describe('We can confirm our storage exists', function () {
            it('Gives us a Filesystem object after we, the collective users, confirm we are okay with it', function () {
		var service = new FileStorageService();
		service.confirmStorage(function(fs){
			runs(function(){
				expect(fs).toBeDefined();
			});
		});		

	    });
	});
	
	describe('We can get the usage information we have alloted for the filesystem for this domain', function () {	
            it('Give us the total as 2GB', function () {
		var service = new FileStorageService();
		service.requestQuotaUsage()
		.done(function(quotaData){
			runs(function(){
				expect(quotaData.total).toBe(2*Math.pow(1024, 3));
			});
		})
		.fail(function(){
			runs(function(){
				expect(true).toBe(false);
			});
		});
            });
        });
	
    });
})();
