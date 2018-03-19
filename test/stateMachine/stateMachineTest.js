var test = require('tape');
var stateMachine = require('../../src/stateMachine/stateMachine');
var message = require('../../src/message');
var sjcl = require('sjcl-all');
var util = require('ethereumjs-util');

var privateKey =  util.toBuffer('0xe331b6d69882b4cb4ea581d88e0b604039a3de5967688d3dcffdd2270c0fd109');
var publicKey =util.privateToPublic(privateKey);
var address = util.pubToAddress(publicKey);
var channelAddress = address.toString("hex");

test('test messages', function(t){
  t.test('test initialize initiator',function  (assert) {
    var secret = "SECRET";
    var mediatedTransfer = new message.MediatedTransfer({nonce:new  util.BN(10),
      lock:{amount:new util.BN(100),expiration:new util.BN(20),hashLock:util.sha3(secret)},
      target:address,
      to:address
    });

    mediatedTransfer.sign(privateKey);

    debugger

    var mediatedTransferState = Object.assign({},mediatedTransfer,{secret:secret});
    stateMachine.Initiator.handle(mediatedTransferState,'init');

    //console.log(mediatedTransferState);
    var revealSecret = new message.RevealSecret({nonce:new  util.BN(10),secret:secret});
    revealSecret.sign(privateKey);
    var requestSecret = new message.RequestSecret({
      to:address,
      hashLock:util.sha3(secret)
    });

    try{
      stateMachine.Initiator.handle(mediatedTransferState,'receiveRequestSecret',requestSecret);
    }catch (e){

    }
    requestSecret.sign(privateKey);
    stateMachine.Initiator.handle(mediatedTransferState,'receiveRequestSecret',requestSecret);
    assert.equal(revealSecret.from.compare(address),0);
    stateMachine.Initiator.handle(mediatedTransferState,'receiveRevealSecret',revealSecret);
    console.log(mediatedTransferState);
    //stateMachine.Target.handle(receiveMediatedTransfer,'init');


    var receiveMediatedTransfer = new message.MediatedTransfer(JSON.parse(JSON.stringify(mediatedTransfer),message.JSON_REVIVER_FUNC));
    assert.equal(receiveMediatedTransfer.from.compare(mediatedTransfer.from),0);
    stateMachine.Target.handle(receiveMediatedTransfer,'init');
    stateMachine.Target.handle(receiveMediatedTransfer,'receiveRevealSecret',revealSecret);
    assert.equal(receiveMediatedTransfer. __machina__['mediated-transfer'].state, 'awaitSecretToProof');
    stateMachine.Target.handle(receiveMediatedTransfer,'receiveRevealSecret',revealSecret);

    var proof = Object.assign({},mediatedTransfer.toProof(),{secret:secret,to:address});
    var secretToProof =  new message.SecretToProof(proof);
    secretToProof.sign(privateKey);

    console.log("SECRET TO PROOF FROM:"+secretToProof.from.toString('hex'));
    var receiveSecretToProof = new message.SecretToProof(JSON.parse(JSON.stringify(secretToProof),message.JSON_REVIVER_FUNC));
    console.log("SECRET TO PROOF FROM:"+receiveSecretToProof.from.toString('hex'));
    assert.equal(receiveMediatedTransfer. __machina__['mediated-transfer'].state, 'awaitSecretToProof');
    stateMachine.Target.handle(receiveMediatedTransfer,'receiveSecretToProof',receiveSecretToProof);
    assert.equal(receiveMediatedTransfer. __machina__['mediated-transfer'].state, 'completedTransfer');


    assert.end();
    // body...
  })

  t.test('different messages do not interfere with states',function (assert) {
    assert.end();
  })

  t.test('correct event ordering Initiator');

  t.test('correct event ordering Target');

  t.test('invalid secret request');

  t.test('invalid secret reveal from Initiator')

  t.test('invalid  secret reveal from Target');

  t.test('invalid secretToProof');

});