var cdnDler = require('../index.js');
var assert = require('assert');

describe('cdn-dler module', function() {
  describe('openHtmlFile(test.html)', function() {
    it('Should open the test.html file', function() {
      //assert.equal(-1, [1,2,3].indexOf(4));
        return cdnDler.openHtmlFile("./test/test.html");      
    });
  });

  describe('getTag(teststring)', function() {
    it('Should parse URL', function() {
      const URL = "https://example.com/file.js";
      const HTML = `<html><head><script src="${URL}"></script></head><body></body></html>`
        assert.equal(URL,cdnDler.getTag(HTML));
    });
  });
});