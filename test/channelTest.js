var test = require('tape');
var merkleTree = require('../src/MerkleTree');
var channelState = require('../src/ChannelState');
var channel = require('../src/Channel');
const util = require('ethereumjs-util');
const message =require('../src/message');


var privateKey =  util.toBuffer('0xe331b6d69882b4cb4ea581d88e0b604039a3de5967688d3dcffdd2270c0fd109');
var publicKey =util.privateToPublic(privateKey);
var address = util.pubToAddress(publicKey);


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


test('test messages', function(t){
  // t.test('empty merkle tree',function (assert) {

  //   var mt = new merkleTree.MerkleTree([]);
  //   assert.equals(mt.getRoot().compare(Buffer.alloc(32)),0);
  //   assert.end()// body...
  // })
  t.test('ChannelState:mediatedTansfer+mediatedTansfer+RevealSecret+WrongRevealSecret+RevealSecret+SecretToProof',function (assert) {

    var myState = new channelState.ChannelState({depositBalance:new util.BN(123)});
    assertStateBN(assert,myState,0,123,0,0,0);


    var locks=[{secret:util.toBuffer("SECRET1"),amount:10,expiration:20},
    {secret:util.toBuffer("SECRET2"),amount:20,expiration:40},
    {secret:util.toBuffer("SECRET3"),amount:30,expiration:-20}];

    var testLocks = locks.map(function(lock){ return createTestLock(lock.amount,
      lock.expiration,
      lock.secret)});

    console.log(testLocks);

    var testMT = computeMerkleTree(testLocks.slice(0,1));
    var mediatedTansfer = createMediatedTransfer(1,1,50,address,testMT.getRoot(),address,
      address,address,testLocks[0]);
    mediatedTansfer.sign(privateKey);

    var testMT2 = computeMerkleTree(testLocks.slice(0,2))
    var mediatedTansfer2 = createMediatedTransfer(2,2,50,address,testMT2.getRoot(),address,
      address,address,testLocks[1]);
    mediatedTansfer2.sign(privateKey);



    //(msgID,nonce,transferredAmount,channelAddress,locksRoot,to,secret)
    var testMT3 = computeMerkleTree(testLocks.slice(0,1));
    var s2p = createSecretToProof(2,3,testLocks[1].amount,address,testMT3.getRoot(),address,
      locks[1].secret);
    s2p.sign(privateKey);

        //(msgID,nonce,transferredAmount,channelAddress,locksRoot,to)
    var dt = createDirectTransfer(3,4,45,address,testMT2.getRoot(),address);
    var invalidDt = createDirectTransfer(3,4,45,address,testMT3.getRoot(),address);
    dt.sign(privateKey);

    var testMT4 = computeMerkleTree([testLocks[0],testLocks[2]]);
    var mediatedTansfer3 = createMediatedTransfer(4,5,45,address,testMT4.getRoot(),address,
      address,address,testLocks[2]);
    mediatedTansfer3.sign(privateKey);

    var revealSecret3 = createRevealSecret(address,locks[2].secret);
    revealSecret3.sign(privateKey);

    var testMT4 = computeMerkleTree([testLocks[2]]);
    var s2p2 = createSecretToProof(1,6,new util.BN(55),address,testMT4.getRoot(),address,
      locks[0].secret);
    s2p2.sign(privateKey);

    var testMT5 = new merkleTree.MerkleTree([]);
    var s2p3 = createSecretToProof(4,7,new util.BN(85),address,testMT5.getRoot(),address,
      locks[2].secret);
    s2p3.sign(privateKey);

    myState.applyLockedTransfer(mediatedTansfer);
    console.log("APPLIED MEDIATED TRANSFER:"+JSON.stringify(myState));

    assert.equals(mediatedTansfer.from.compare(address),0);
    console.log("LOCKED AMOUNT:"+myState.lockedAmount());

    assert.equals(myState.lockedAmount().eq(testLocks[0].amount),true);
    assert.equals(myState.unlockedAmount().eq(new util.BN(0)),true);

    var wrongRevealSecret = createRevealSecret(address,testLocks[1].secret);
    assert.throws(function(){myState.applyRevealSecret(wrongRevealSecret)},"Invalid Lock: uknown lock secret received");

    //send a secretToProof of a future lock
    assert.throws(function  () {
      myState.applySecretToProof(s2p);
    },"Invalid Lock: uknown lock secret received");

    assert.equals(myState.lockedAmount().eq(testLocks[0].amount),true);
    assert.equals(myState.unlockedAmount().eq(new util.BN(0)),true);


    //send second lock transfer
    myState.applyLockedTransfer(mediatedTansfer2);
    assert.equals(myState.lockedAmount().eq(testLocks[0].amount.add(testLocks[1].amount)),true);
    assert.equals(myState.unlockedAmount().eq(new util.BN(0)),true);


    var correctRevealSecret = createRevealSecret(address,locks[0].secret);
    myState.applyRevealSecret(correctRevealSecret);


    assert.equals(myState.lockedAmount().eq(new util.BN(20)),true);
    assert.equals(myState.unlockedAmount().eq(new util.BN(10)),true);
    assert.equals(myState.nonce.eq(new util.BN(2)),true);

    var correctRevealSecret2 = createRevealSecret(address,locks[1].secret);
    myState.applyRevealSecret(correctRevealSecret2);


    assert.equals(myState.lockedAmount().eq(new util.BN(0)),true);
    assert.equals(myState.unlockedAmount().eq(new util.BN(30)),true);
    assert.equals(myState.nonce.eq(new util.BN(2)),true);


    //lets unlock the second lock
    console.log(JSON.stringify(s2p));
    myState.applySecretToProof(s2p);

    assert.equals(myState.lockedAmount().eq(new util.BN(0)),true);
    assert.equals(myState.unlockedAmount().eq(new util.BN(10)),true);
    assert.equals(myState.proof.transferredAmount.eq(new util.BN(20)),true);
    assert.equals(myState.proof.nonce.eq(new util.BN(3)),true);

    //send dt with rock locksRoot
    assert.throws(function(){myState.applyDirectTransfer(invalidDt)},"Invalid hashLockRoot");
    assert.equals(myState.lockedAmount().eq(new util.BN(0)),true);
    assert.equals(myState.unlockedAmount().eq(new util.BN(10)),true);
    assert.equals(myState.proof.transferredAmount.eq(new util.BN(20)),true);
    assert.equals(myState.proof.nonce.eq(new util.BN(3)),true);


    //now send proper locksroot
    myState.applyDirectTransfer(dt);

    assert.equals(myState.lockedAmount().eq(new util.BN(0)),true);
    assert.equals(myState.unlockedAmount().eq(new util.BN(10)),true);
    assert.equals(myState.proof.transferredAmount.eq(new util.BN(45)),true);
    assert.equals(myState.proof.nonce.eq(new util.BN(4)),true);

    //send 3rd mediated transfer
    myState.applyLockedTransfer(mediatedTansfer3);

    assert.equals(myState.lockedAmount().eq(new util.BN(30)),true);
    assert.equals(myState.unlockedAmount().eq(new util.BN(10)),true);
    assert.equals(myState.proof.transferredAmount.eq(new util.BN(45)),true);
    assert.equals(myState.proof.nonce.eq(new util.BN(5)),true);
    console.log(JSON.stringify(myState.proof));

    //unlock the last secret
    myState.applyRevealSecret(revealSecret3);
    assert.equals(myState.lockedAmount().eq(new util.BN(0)),true);
    assert.equals(myState.unlockedAmount().eq(new util.BN(40)),true);
    assert.equals(myState.proof.transferredAmount.eq(new util.BN(45)),true);
    assert.equals(myState.proof.nonce.eq(new util.BN(5)),true);

    //secret to proof for lock 1
    myState.applySecretToProof(s2p2);
    assert.equals(myState.lockedAmount().eq(new util.BN(0)),true);
    assert.equals(myState.unlockedAmount().eq(new util.BN(30)),true);
    assert.equals(myState.proof.transferredAmount.eq(new util.BN(55)),true);
    assert.equals(myState.proof.locksRoot.compare(testMT4.getRoot()),0);
    assert.equals(myState.proof.nonce.eq(new util.BN(6)),true);

    myState.applySecretToProof(s2p3);
    assert.equals(myState.lockedAmount().eq(new util.BN(0)),true);
    assert.equals(myState.unlockedAmount().eq(new util.BN(0)),true);
    assert.equals(myState.proof.transferredAmount.eq(new util.BN(85)),true);
    assert.equals(myState.proof.locksRoot.compare(testMT5.getRoot()),0);
    assert.equals(myState.proof.nonce.eq(new util.BN(7)),true);


    assert.equals(myState.proof.from.compare(address),0);

    assert.end();
    console.log(myState.proof);



    // var solidityHash = abi.soliditySHA3(
    //  [ "uint256", "uint256", "address","bytes32","bytes32" ],
    //  [myState.proof..nonce,
    //   myState.proof..transferredAmount,
    //   myState.proof..channelAddress,
    //   myState.proof..locksRoot,
    //   myState.proof.]);
    // return solidityHash;
    // var pk = util.ecrecover(buffer,myState.proof.signature.v,util.toBuffer(myState.proof.signature.r),
    //   util.toBuffer(myState.proof.signature.s));
    // var address = util.pubToAddress(pk);
    return address;
  })

  t.test('register transfer to unknown channel',function  (assert) {

    assert.end();
  })

  t.test('direct transfer invalid locksRoot',function (assert) {
    assert.end();
  })
  t.test('mediatedTansfer invalid locksRoot',function (assert) {
    assert.end();
  })

  t.test('mediatedTansfer register same lock multiple times',function (assert) {
    assert.end();
  })

});