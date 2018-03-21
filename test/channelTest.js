var test = require('tape');
var MerkleTree = require('../src/MerkleTree');
var ChannelState = require('../src/ChannelState');
var Channel = require('../src/Channel');
const util = require('ethereumjs-util');

var privateKey =  util.toBuffer('0xe331b6d69882b4cb4ea581d88e0b604039a3de5967688d3dcffdd2270c0fd109');
var publicKey =util.privateToPublic(privateKey);
var address = util.pubToAddress(publicKey);



test('test messages', function(t){
  t.test('can initialize ChannelState',function (assert) {


    assert.equals(true,false);
    assert.end();

  })

  t.test('register transfer to unknown channel',function  (assert) {
    assert.equals(true,false);
    assert.end();
  })

});