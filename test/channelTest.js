var test = require('tape');
var merkleTree = require('../src/MerkleTree');
var channelState = require('../src/ChannelState');
var channelLib = require('../src/Channel');
const util = require('ethereumjs-util');
const message =require('../src/message');


var privateKey =  util.toBuffer('0xe331b6d69882b4cb4ea581d88e0b604039a3de5967688d3dcffdd2270c0fd109');
var publicKey =util.privateToPublic(privateKey);
var address = util.pubToAddress(publicKey);

var pk_addr = [{pk:util.toBuffer('0xa63c8dec79b2c168b8b76f131df6b14a5e0a1ab0310e0ba652f39bca158884ba'),
address: util.toBuffer('0x6877cf5f9af67d622d6c665ea473e0b1a14f99d0')},
{pk:util.toBuffer('0x6f1cc905d0a87054c15f183eae89ccc8dc3a79702fdbb47ae337583d22df1a51'),
address: util.toBuffer('0x43068d574694419cb76360de33fbd177ecd9d3c6')
},
{pk:util.toBuffer('0x8dffbd99f8a386c18922a014b5356344a4ac1dbcfe32ee285c3b23239caad10d'),
address: util.toBuffer('0xe2b7c4c2e89438c2889dcf4f5ea935044b2ba2b0')
}];


function assertStateBN(assert,state,nonce,depositBalance,transferredAmount,lockedAmount,unlockedAmount){
  assert.equals(state.nonce.eq(new util.BN(nonce)),true);
  assert.equals(state.proof.transferredAmount.eq(new util.BN(transferredAmount)),true);
  assert.equals(state.lockedAmount().eq(new util.BN(lockedAmount)),true);
  assert.equals(state.unlockedAmount().eq(new util.BN(unlockedAmount)),true);
  assert.equals(state.depositBalance.eq(new util.BN(depositBalance)),true);
}

function assertStateProof(assert,state,nonce,transferredAmount,hashLockRoot,channelAddress){
  assert.equals(state.proof.nonce.eq(new util.BN(nonce)),true);
  assert.equals(state.proof.transferredAmount.eq(new util.BN(transferredAmount)),true);
  assert.equals(state.proof.hashLockRoot.compare(util.toBuffer(hashLockRoot)),0);
  assert.equals(state.proof.channelAddress.compare(util.toBuffer(channelAddress)),0);
}

function assertSignature(assert,state,r,s,v){
  assert.equals(state.proof.signature.r.compare(util.toBuffer(r)),0);
  assert.equals(state.proof.signature.s.compare(util.toBuffer(s)),0);
  assert.equals(state.proof.signature.v.compare(v),0);
}


function createTestLock(amount,expiration,secret){

  return new message.Lock({
    amount:new util.BN(amount),
    expiration:new util.BN(expiration),
    hashLock:util.sha3(secret)
  })
}

function createMediatedTransfer(msgID,nonce,transferredAmount,channelAddress,locksRoot,to,target,initiator,lock){
  return new message.MediatedTransfer({msgID:new util.BN(msgID),nonce:new util.BN(nonce),
    transferredAmount:new util.BN(transferredAmount),
    channelAddress:util.toBuffer(channelAddress),locksRoot:util.toBuffer(locksRoot),
    to:util.toBuffer(to),target:util.toBuffer(target),initiator:util.toBuffer(initiator),
    lock:lock});

}

function createRevealSecret(to,secret){
  return new message.RevealSecret({secret:util.toBuffer(secret),to:to});
}

function createSecretToProof (msgID,nonce,transferredAmount,channelAddress,locksRoot,to,secret) {
  return new message.SecretToProof({
    msgID:new util.BN(msgID),
    nonce:new util.BN(nonce),
    transferredAmount:new util.BN(transferredAmount),
    channelAddress:util.toBuffer(channelAddress),
    locksRoot:util.toBuffer(locksRoot), // locksRoot - sha3(secret)
    to:util.toBuffer(to),
    secret:util.toBuffer(secret)
  });
}

function createDirectTransfer (msgID,nonce,transferredAmount,channelAddress,locksRoot,to) {
  return new message.DirectTransfer({
    msgID:new util.BN(msgID),
    nonce:new util.BN(nonce),
    transferredAmount:new util.BN(transferredAmount),
    channelAddress:util.toBuffer(channelAddress),
    locksRoot:util.toBuffer(locksRoot), // locksRoot - sha3(secret)
    to:util.toBuffer(to)
  });
}

function computeMerkleTree(lockElements){
  var mt = new merkleTree.MerkleTree(lockElements.map(
        function (l) {
        return l.getMessageHash();
      }));
  mt.generateHashTree();
  return mt;
}

function printProof(myState){

    console.log("R:"+myState.proof.signature.r.toString('hex'));
    console.log("S:"+myState.proof.signature.s.toString('hex'));
    console.log("V:"+myState.proof.signature.v);
    console.log("SEND TO SOLIDITY APPEND HASH:"+myState.proof.nonce.toString(10) + "," +
      myState.proof.transferredAmount.toString(10)+ "," +
      "\""+util.addHexPrefix(myState.proof.channelAddress.toString('hex'))+ "\"," +
      "\""+util.addHexPrefix(myState.proof.locksRoot.toString('hex'))+ "\"," +
      "\""+util.addHexPrefix(myState.proof.messageHash.toString('hex'))+ "\""
      )
    console.log("OUR HASH:"+myState.proof.getHash().toString('hex'));
}
test('test channel', function(t){



  t.test('test transferrableFromTo',function (assert) {

     var myState = new channelState.ChannelState({depositBalance:new util.BN(123),
      address:pk_addr[0].address
    });

    var peerState = new channelState.ChannelState({depositBalance:new util.BN(200),
        address:pk_addr[1].address
      });

      //constructor(peerState,myState,channelAddress,settleTimeout,revealTimeout,currentBlock){
    var channel = new channelLib.Channel(peerState,myState,address,
        new util.BN(100),
        new util.BN(10),
        10);
    var transferrable = channel.transferrableFromTo(channel.myState,channel.peerState);
    assert.equals(transferrable.eq(new util.BN(123)),true,'correct transferrable amount from mystate');
    transferrable = channel.transferrableFromTo(channel.peerState,channel.myState);
    assert.equals(transferrable.eq(new util.BN(200)),true,'correct transferrable amount from peerstate');
    assert.end();
  })
  t.test('channel component test: direct transfer',function  (assert) {
     var myState = new channelState.ChannelState({depositBalance:new util.BN(123),
      address:pk_addr[0].address
    });

    var peerState = new channelState.ChannelState({depositBalance:new util.BN(200),
        address:pk_addr[1].address
      });

      //constructor(peerState,myState,channelAddress,settleTimeout,revealTimeout,currentBlock){
    var channel = new channelLib.Channel(peerState,myState,address,
        new util.BN(100),
        new util.BN(10),
        10);
    assert.equals(myState.address.compare(pk_addr[0].address),0);
    assertStateBN(assert,myState,0,123,0,0,0);

    assert.equals(peerState.address.compare(pk_addr[1].address),0);
    assertStateBN(assert,peerState,0,200,0,0,0);
    var msgID = new util.BN(0);
    var transferredAmount = new util.BN(10);
    var directTransfer = channel.createDirectTransfer(msgID,transferredAmount);
    assert.equals(directTransfer.to.compare(pk_addr[1].address),0);


    assert.throws(function () {
      directTransfer.from;
    }, "no signature to recover address from");

    directTransfer.sign(pk_addr[0].pk);
    assert.equals(directTransfer.from.compare(pk_addr[0].address),0);
    console.log(directTransfer);
    channel.handleTransfer(directTransfer,new util.BN(2));
    assert.equals(channel.myState.transferredAmount.eq(new util.BN(10)),true);
    assert.equals(channel.peerState.transferredAmount.eq(new util.BN(0)),true);


    var transferrable = channel.transferrableFromTo(channel.myState,channel.peerState);

    assert.equals(transferrable.eq(new util.BN(113)),true,'correct transferrable amount from mystate');
    transferrable = channel.transferrableFromTo(channel.peerState,channel.myState);
    console.log(transferrable);
    assert.equals(transferrable.eq(new util.BN(210)),true,'correct transferrable amount from peerstate');

    assert.end();
  })

  // t.test('channel component test: currentBlock expired mediatedtransfer');
  // t.test('channel component test: closed channel');
  // t.test('channel component test: settled channel');

});