var test = require('tape');
var stateMachine = require('../../src/stateMachine/stateMachine');
var message = require('../../src/message');
var sjcl = require('sjcl-all');
var util = require('ethereumjs-util');
var channel = require('../../src/channel');

var privateKey =  util.toBuffer('0xe331b6d69882b4cb4ea581d88e0b604039a3de5967688d3dcffdd2270c0fd109');
var publicKey =util.privateToPublic(privateKey);
var address = util.pubToAddress(publicKey);
var channelAddress = address.toString("hex");

function createMediatedTransfer(msgID,nonce,transferredAmount,channelAddress,locksRoot,to,target,initiator,lock,expiration){
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

function assertState(assert,state,expectedState){
   assert.equal(state.__machina__['mediated-transfer'].state, expectedState);
}
test('test stateMachine transfers', function(t){
  function setup(assert){
       pk_addr = [{pk:util.toBuffer('0xa63c8dec79b2c168b8b76f131df6b14a5e0a1ab0310e0ba652f39bca158884ba'),
    address: util.toBuffer('0x6877cf5f9af67d622d6c665ea473e0b1a14f99d0')},
    {pk:util.toBuffer('0x6f1cc905d0a87054c15f183eae89ccc8dc3a79702fdbb47ae337583d22df1a51'),
    address: util.toBuffer('0x43068d574694419cb76360de33fbd177ecd9d3c6')
    },
    {pk:util.toBuffer('0x8dffbd99f8a386c18922a014b5356344a4ac1dbcfe32ee285c3b23239caad10d'),
    address: util.toBuffer('0xe2b7c4c2e89438c2889dcf4f5ea935044b2ba2b0')
    }];

     initiatorEvents = [];
    targetEvents = [];
    serialEvents = [];

    assertEmit = function(event){
      assert.equal(serialEvents[serialEvents.length-1],event,true);
    };

    stateMachine.Initiator.on("*",function(event,state){
      if(event.startsWith("GOT.")){
        serialEvents.push(event);
      }
      initiatorEvents.push(state)
    });
    stateMachine.Target.on("*",function  (event,state) {
      if(event.startsWith("GOT.")){
        serialEvents.push(event);
      }

      targetEvents.push(state);
    });



    //create a mediated transfer state object
     secret = "SECRET";
     currentBlock = new util.BN(1231231);
     initiator = pk_addr[0];
     target = pk_addr[1];
     mediatedTransferState = Object.assign({secret:secret},createMediatedTransfer(new util.BN(123),
      new util.BN(10),
      new util.BN(0),
      address,
      util.sha3(secret),
      target.address, //to
      target.address, //target
      initiator.address, //initiator
      {
        amount:new util.BN(100),
        expiration:currentBlock.add(channel.SETTLE_TIMEOUT),
        hashLock:util.sha3(secret)
      }));

  }


  t.test('test full state machine lifecyle between initiator and target',function  (assert) {

    setup(assert);


    stateMachine.Initiator.handle(mediatedTransferState,'init');
    assertState(assert,mediatedTransferState, 'awaitRequestSecret');
    assertEmit('GOT.sendMediatedTransfer');
    //send a mediated transfer

    var mediatedTransfer = new message.MediatedTransfer(initiatorEvents[initiatorEvents.length-1].client);
    mediatedTransfer.sign(initiator.pk);
    var receivedMT = new message.MediatedTransfer(JSON.parse(JSON.stringify(mediatedTransfer), message.JSON_REVIVER_FUNC));

    stateMachine.Target.handle(receivedMT,'init',currentBlock);
    assertState(assert,receivedMT,'awaitRevealSecret');
    assertEmit('GOT.sendRequestSecret');

    var requestSecret =  new message.RequestSecret({to:targetEvents[targetEvents.length-1].client.from,
      msgID: targetEvents[targetEvents.length-1].client.msgID,
      hashLock:targetEvents[targetEvents.length-1].client.lock.hashLock,
      amount:targetEvents[targetEvents.length-1].client.lock.amount});
    requestSecret.sign(target.pk);

    var receivedRS = new message.RequestSecret(JSON.parse(JSON.stringify(requestSecret),message.JSON_REVIVER_FUNC));
    stateMachine.Initiator.handle(mediatedTransferState,'receiveRequestSecret',receivedRS);
    assertState(assert,mediatedTransferState, 'awaitRevealSecret');
    assertEmit('GOT.sendRevealSecret');

    var revealSecret = createRevealSecret(initiatorEvents[initiatorEvents.length-1].client.target, initiatorEvents[initiatorEvents.length-1].client.secret);
    try{
      stateMachine.Target.handle(receivedMT,'receiveRevealSecret',revealSecret);
    }catch(err){
      assert.equals(err.message, "no signature to recover address from","state should not move ahead incase secret is learned through blockchain or leak");

    }
    assertState(assert,receivedMT,'awaitRevealSecret');

    revealSecret.sign(initiator.pk);
    stateMachine.Target.handle(receivedMT,'receiveRevealSecret',revealSecret);
    assertState(assert,receivedMT,'awaitSecretToProof');
    assertEmit('GOT.sendRevealSecret');

    var targetRS = createRevealSecret(targetEvents[targetEvents.length-1].client.from, targetEvents[targetEvents.length-1].client.secret);
     try{
      stateMachine.Initiator.handle(mediatedTransferState,'receiveRevealSecret',targetRS);
    }catch(err){
      assert.equals(err.message, "no signature to recover address from","state should not move ahead incase revealSecret is not sent by to");
    }
    assertState(assert,mediatedTransferState,'awaitRevealSecret');
    targetRS.sign(target.pk);
    stateMachine.Initiator.handle(mediatedTransferState,'receiveRevealSecret',targetRS);
    assertState(assert,mediatedTransferState, 'completedTransfer');
    assertState(assert,receivedMT, 'awaitSecretToProof');
    assertEmit('GOT.sendSecretToProof');

    var secretToProof = createSecretToProof (initiatorEvents[initiatorEvents.length-1].msgID,
      initiatorEvents[initiatorEvents.length-1].nonce,
      initiatorEvents[initiatorEvents.length-1].transferredAmount,
      initiatorEvents[initiatorEvents.length-1].channelAddress,
      initiatorEvents[initiatorEvents.length-1].locksRoot,
      initiatorEvents[initiatorEvents.length-1].to,
      initiatorEvents[initiatorEvents.length-1].secret);
    secretToProof.sign(initiator.pk);

    var receivedSTP = new message.SecretToProof(JSON.parse(JSON.stringify(secretToProof),message.JSON_REVIVER_FUNC));
    stateMachine.Target.handle(receivedMT, 'receiveSecretToProof', receivedSTP);
    assertState(assert,receivedMT,'completedTransfer');


    assert.end();
    // body...
  });

  t.test('initiator: invalid secret request should not move state ahead',function(assert){
    setup(assert);

    stateMachine.Initiator.handle(mediatedTransferState,'init');
    assertState(assert,mediatedTransferState, 'awaitRequestSecret');
    assertEmit('GOT.sendMediatedTransfer');
    //send a mediated transfer

    var mediatedTransfer = new message.MediatedTransfer(initiatorEvents[initiatorEvents.length-1].client);
    mediatedTransfer.sign(initiator.pk);
    var receivedMT = new message.MediatedTransfer(JSON.parse(JSON.stringify(mediatedTransfer), message.JSON_REVIVER_FUNC));

    stateMachine.Target.handle(receivedMT,'init',currentBlock);
    assertState(assert,receivedMT,'awaitRevealSecret');
    assertEmit('GOT.sendRequestSecret');

    //invalid hashLock
    var requestSecret =  new message.RequestSecret({to:targetEvents[targetEvents.length-1].client.from,
      msgID: targetEvents[targetEvents.length-1].client.msgID,
      hashLock:util.sha3("SECRET2"),
      amount:targetEvents[targetEvents.length-1].client.lock.amount});
    requestSecret.sign(target.pk);

    var receivedRS = new message.RequestSecret(JSON.parse(JSON.stringify(requestSecret),message.JSON_REVIVER_FUNC));
    stateMachine.Initiator.handle(mediatedTransferState,'receiveRequestSecret',receivedRS);
    assertState(assert,mediatedTransferState, 'awaitRequestSecret');

    // //invalid amount
    // requestSecret =  new message.RequestSecret({to:targetEvents[targetEvents.length-1].client.from,
    //   msgID: targetEvents[targetEvents.length-1].client.msgID,
    //   hashLock:targetEvents[targetEvents.length-1].client.lock.hashLock,
    //   amount:new util.BN(123123123123)});
    // requestSecret.sign(target.pk);

    // receivedRS = new message.RequestSecret(JSON.parse(JSON.stringify(requestSecret),message.JSON_REVIVER_FUNC));
    // stateMachine.Initiator.handle(mediatedTransferState,'receiveRequestSecret',receivedRS);
    // assertState(assert,mediatedTransferState, 'awaitRequestSecret');

    //invalid msgID
    requestSecret =  new message.RequestSecret({to:targetEvents[targetEvents.length-1].client.from,
      msgID: new util.BN(3),
      hashLock:targetEvents[targetEvents.length-1].client.lock.hashLock,
      amount:targetEvents[targetEvents.length-1].client.lock.amount});
    requestSecret.sign(target.pk);
    receivedRS = new message.RequestSecret(JSON.parse(JSON.stringify(requestSecret),message.JSON_REVIVER_FUNC));
    stateMachine.Initiator.handle(mediatedTransferState,'receiveRequestSecret',receivedRS);
    assertState(assert,mediatedTransferState, 'awaitRequestSecret');

    //invalid signature
    requestSecret =  new message.RequestSecret({to:targetEvents[targetEvents.length-1].client.from,
      msgID: targetEvents[targetEvents.length-1].client.msgID,
      hashLock:targetEvents[targetEvents.length-1].client.lock.hashLock,
      amount:targetEvents[targetEvents.length-1].client.lock.amount});
    requestSecret.sign(pk_addr[2].pk);
    receivedRS = new message.RequestSecret(JSON.parse(JSON.stringify(requestSecret),message.JSON_REVIVER_FUNC));
    stateMachine.Initiator.handle(mediatedTransferState,'receiveRequestSecret',receivedRS);
    assertState(assert,mediatedTransferState, 'awaitRequestSecret');


    assert.end();
  });

  t.test('target: invalid secret reveal from Initiator should not move state ahead');

  t.test('initiator: invalid  secret reveal from Target should keep same state');

  t.test('initiator: secret reveal not from Target should not move state ahead');

  t.test('target: invalid secretToProof should not move state ahead');

  t.test('target: handle not safe to open lock should move state to expiredTransfer');

  t.test('target: handle open lock timeout should initiate a close channel');

  t.test('target: handle expired lock',function (assert) {
     var initiatorEvents = [];
    var targetEvents = [];
    stateMachine.Initiator.on("*",function(event,state){

      initiatorEvents.push(state)});
    stateMachine.Target.on("*",function  (event,state) {
      targetEvents.push(state);
    });


    //create a mediated transfer state object
    var secret = "SECRET";
    var currentBlock = new util.BN(1231231);
    var mediatedTransferState = Object.assign({secret:secret},createMediatedTransfer(new util.BN(123),
      new util.BN(10),
      new util.BN(0),
      address,
      util.sha3(secret),
      address,
      address,
      address,{
        amount:new util.BN(100),
        expiration:currentBlock.add(channel.REVEAL_TIMEOUT),
        hashLock:util.sha3(secret)
      }));


    stateMachine.Initiator.handle(mediatedTransferState,'init');
    assertState(assert,mediatedTransferState, 'awaitRequestSecret');
    //send a mediated transfer

    var mediatedTransfer = new message.MediatedTransfer(initiatorEvents[0].client);
    mediatedTransfer.sign(privateKey);
    var receivedMT = new message.MediatedTransfer(JSON.parse(JSON.stringify(mediatedTransfer), message.JSON_REVIVER_FUNC));

    stateMachine.Target.handle(receivedMT,'init',currentBlock.add(new util.BN(1)));
    assertState(assert,receivedMT,'expiredTransfer');
    assert.end();
  })




  //secret reveal from non-partner node

});