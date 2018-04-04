test = require('tape');
engineLib = require('../src/engine');
channel = require('../src/channel');
util = require('ethereumjs-util');
message = require('../src/message');

var privateKey =  util.toBuffer('0xe331b6d69882b4cb4ea581d88e0b604039a3de5967688d3dcffdd2270c0fd109');
var publicKey =util.privateToPublic(privateKey);
var channelAddress = util.pubToAddress(publicKey);
var events = require('events');
//setup global public/private key pairs
var pk_addr = [{pk:util.toBuffer('0xa63c8dec79b2c168b8b76f131df6b14a5e0a1ab0310e0ba652f39bca158884ba'),
address: util.toBuffer('0x6877cf5f9af67d622d6c665ea473e0b1a14f99d0')},
{pk:util.toBuffer('0x6f1cc905d0a87054c15f183eae89ccc8dc3a79702fdbb47ae337583d22df1a51'),
address: util.toBuffer('0x43068d574694419cb76360de33fbd177ecd9d3c6')
},
{pk:util.toBuffer('0x8dffbd99f8a386c18922a014b5356344a4ac1dbcfe32ee285c3b23239caad10d'),
address: util.toBuffer('0xe2b7c4c2e89438c2889dcf4f5ea935044b2ba2b0')
}];



class TestEventBus extends events.EventEmitter{
  constructor(){
    super();
    this.engine = {};
    this.on('send',this.onReceive);
    this.msgCount=0;
  }

  addEngine(engine){
    this.engine[engine.address.toString('hex')] = engine;

    var self = this;
    engine.send = function (msg) {
      console.log("SENDING:"+msg.from.toString('hex')+"->"+msg.to.toString('hex')+" of type:"+msg.classType);
      var emitter = self;
      setTimeout(function(){
        emitter.emit('beforeSending-'+emitter.msgCount,msg);
        emitter.emit('send',message.SERIALIZE(msg));
        emitter.emit('afterSending-'+emitter.msgCount, msg)
      }, 100);
    }

  }



  onReceive(packet){
    this.msgCount++;
    var msg = message.DESERIALIZE_AND_DECODE_MESSAGE(packet);
    this.emit('beforeReceiving-'+this.msgCount,msg);
    this.engine[msg.to.toString('hex')].onMessage(msg);
    this.emit('afterReceiving-'+this.msgCount,msg);

  }


}

function assertChannelState(assert,
      engine,channelAddress,nonce,depositBalance,transferredAmount,lockedAmount,unlockedAmount,
      peerNonce,peerDepositBalance,peerTransferredAmount,peerLockedAmount,peerUnlockedAmount,currentBlock){

  var state1 = engine.channels[channelAddress.toString('hex')].myState;
  assertStateBN(assert,state1,nonce,depositBalance,transferredAmount,lockedAmount,unlockedAmount,currentBlock)
  var state2 = engine.channels[channelAddress.toString('hex')].peerState;
  assertStateBN(assert, state2, peerNonce,peerDepositBalance,peerTransferredAmount,peerLockedAmount,peerUnlockedAmount,currentBlock);

   };
function assertStateBN(assert,state,nonce,depositBalance,transferredAmount,lockedAmount,unlockedAmount,currentBlock){

  assert.equals(state.nonce.eq(new util.BN(nonce)),true, "correect nonce in state");
  assert.equals(state.proof.transferredAmount.eq(new util.BN(transferredAmount)),true, "correct transferredAmount in state");
  if(!currentBlock){
    currentBlock = new util.BN(0);
  }
  assert.equals(state.lockedAmount(currentBlock).eq(new util.BN(lockedAmount)),true, "correct lockedAmount calculated in state");
  assert.equals(state.unlockedAmount().eq(new util.BN(unlockedAmount)),true, "correct unlockedAmount calculated in state");
  assert.equals(state.depositBalance.eq(new util.BN(depositBalance)),true, "correct depositBalance in state");
}

function createEngine(pkIndex,blockchainService){
    var e =  new engineLib.Engine(pk_addr[pkIndex].address, function (msg) {
      console.log("SIGNING MESSAGE");
      msg.sign(pk_addr[pkIndex].pk)
    },blockchainService);
    return e;
}

test('test engine', function(t){


  t.test("can initialize engine",function (assert) {
    var engine = createEngine(0);
    //assert engine parameters
    assert.equals(engine.currentBlock.eq( new util.BN(0)), true, "currentBlock initialized correctly");
    assert.equals(engine.msgID.eq(new util.BN(0)),true, "msgID initialized correctly");
    assert.equals(engine.address.compare(pk_addr[0].address),0, "ethereum address set correctly");

    assert.end();
  })

  t.test("component test: create new channel with 0x"+pk_addr[1].address.toString("hex")+", depositBalance 501,327", function (assert) {
    var currentBlock = new util.BN(0);
    var engine = createEngine(0);
    engine.blockchain = function (cmd) {

        return true;
    };
    //channelAddress,myDeposityBalance,peerAddress
    var depositBalance = new util.BN(501);
    engine.createNewChannel(pk_addr[1].address,depositBalance);
    assert.equals(engine.pendingChannels.hasOwnProperty(pk_addr[1].address.toString('hex')),true);

    try{
      engine.createNewChannel(pk_addr[1].address,depositBalance);
    }catch(err){
      assert.equals(err.message, "Invalid Channel: cannot create new channel as channel already exists with peer","can handle multiple calls to create new channel");
    }

    engine.onNewChannel(channelAddress,
      pk_addr[0].address,
      new util.BN(501),
      pk_addr[1].address,
      new util.BN(0));

    //handle multiple events coming back from blockchain
    try{
      engine.onNewChannel(channelAddress,
        pk_addr[0].address,
      new util.BN(501),
      pk_addr[1].address,
      new util.BN(0));
    }catch(err){
      assert.equals(err.message, "Invalid Channel: cannot add new channel as it already exists", "can handle duplicate calls to onNewChannel");
    }

    assert.equals(engine.pendingChannels.hasOwnProperty(pk_addr[1].address.toString('hex')),false);

    assert.equals(engine.channels.hasOwnProperty(channelAddress.toString('hex')), true);
    assert.equals(engine.channelByPeer.hasOwnProperty(pk_addr[1].address.toString('hex')),true);

    engine.onDeposited(channelAddress,pk_addr[1].address, new util.BN(327));
    assertChannelState(assert,
      engine,channelAddress,new util.BN(0),new util.BN(501),new util.BN(0),new util.BN(0),new util.BN(0),
      new util.BN(0),new util.BN(327),new util.BN(0),new util.BN(0),new util.BN(0),currentBlock);

    //try an out of order deposit
    try{
      engine.onDeposited(channelAddress,pk_addr[1].address, new util.BN(320));
    }catch(err){
      assert.equals(err.message, "Invalid Deposit Amount: deposit must be monotonically increasing");
    }
    assertChannelState(assert,
      engine,channelAddress,new util.BN(0),new util.BN(501),new util.BN(0),new util.BN(0),new util.BN(0),
      new util.BN(0),new util.BN(327),new util.BN(0),new util.BN(0),new util.BN(0),currentBlock);


    assert.end();
  });

  t.test("component test: e2e engine direct transfer", function (assert) {
    var sendQueue = [];
    var blockchainQueue = [];
    var currentBlock = new util.BN(0);
    var engine = createEngine(0);
    var engine2 = createEngine(1);

    //SETUP AND DEPOSIT FOR ENGINES
     engine.send = function  (msg) {
      sendQueue.push(message.SERIALIZE(msg));
    }

    engine2.send = function  (msg) {
      sendQueue.push(message.SERIALIZE(msg));
    }

    engine.blockchain = function (msg)  {
      blockchainQueue.push(msg);
    }
    engine2.blockchain = function (msg)  {
      blockchainQueue.push(msg);
    }

    engine.onNewChannel(channelAddress,
      pk_addr[0].address,
      new util.BN(501),
      pk_addr[1].address,
      new util.BN(0));
    engine2.onNewChannel(channelAddress,
      pk_addr[0].address,
      new util.BN(501),
      pk_addr[1].address,
      new util.BN(0))



    engine.onDeposited(channelAddress,pk_addr[1].address, new util.BN(327));
    engine2.onDeposited(channelAddress,pk_addr[1].address, new util.BN(327));


    assertChannelState(assert,
      engine,channelAddress,
      new util.BN(0),new util.BN(501),new util.BN(0),new util.BN(0),new util.BN(0),
      new util.BN(0),new util.BN(327),new util.BN(0),new util.BN(0),new util.BN(0),currentBlock);
    assertChannelState(assert,
    engine2,channelAddress,
      new util.BN(0),new util.BN(327),new util.BN(0),new util.BN(0),new util.BN(0),
      new util.BN(0),new util.BN(501),new util.BN(0),new util.BN(0),new util.BN(0),currentBlock);

    //END SETUP


    currentBlock = currentBlock.add(new util.BN(1));

    //START  A DIRECT TRANSFER FROM ENGINE(0) to ENGINE(1)

  assert.equals(sendQueue.length, 0, "send direct transfer");
    engine.sendDirectTransfer(pk_addr[1].address,new util.BN(50));
    //sent but not prcessed yet by engine(1) as expected
     assertChannelState(assert,
      engine,channelAddress,
      new util.BN(1),new util.BN(501),new util.BN(50),new util.BN(0),new util.BN(0),
      new util.BN(0),new util.BN(327),new util.BN(0),new util.BN(0),new util.BN(0),currentBlock);
   assertChannelState(assert,
      engine2,channelAddress,
      new util.BN(0),new util.BN(327),new util.BN(0),new util.BN(0),new util.BN(0),
      new util.BN(0),new util.BN(501),new util.BN(0),new util.BN(0),new util.BN(0),currentBlock);
    assert.equals(sendQueue.length, 1, "send direct transfer");


    var msg = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length -1]);
    assert.equals(msg.to.compare(engine2.address),0, "send direct has correct address");
    engine2.onMessage(msg);
    assertChannelState(assert,
      engine,channelAddress,
      new util.BN(1),new util.BN(501),new util.BN(50),new util.BN(0),new util.BN(0),
      new util.BN(0),new util.BN(327),new util.BN(0),new util.BN(0),new util.BN(0),currentBlock);
   assertChannelState(assert,
      engine2,channelAddress,
      new util.BN(0),new util.BN(327),new util.BN(0),new util.BN(0),new util.BN(0),
      new util.BN(1),new util.BN(501),new util.BN(50),new util.BN(0),new util.BN(0),currentBlock);

    engine2.sendDirectTransfer(pk_addr[0].address,new util.BN(377));
    msg = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length -1]);
    assert.equals(sendQueue.length,2);
    engine.onMessage(msg);

    assertChannelState(assert,
      engine,channelAddress,
      new util.BN(1),new util.BN(501),new util.BN(50),new util.BN(0),new util.BN(0),
      new util.BN(1),new util.BN(327),new util.BN(377),new util.BN(0),new util.BN(0),currentBlock);
   assertChannelState(assert,
      engine2,channelAddress,
      new util.BN(1),new util.BN(327),new util.BN(377),new util.BN(0),new util.BN(0),
      new util.BN(1),new util.BN(501),new util.BN(50),new util.BN(0),new util.BN(0),currentBlock);


    //engine2 has no more money left!
    try{
      engine2.sendDirectTransfer(pk_addr[0].address,new util.BN(377));
    }catch(err){
      //GOOD we caught it
      assert.equals(err.message, "Insufficient funds: direct transfer cannot be completed:377 - 377 > 0")
    }

    assertChannelState(assert,
      engine,channelAddress,
      new util.BN(1),new util.BN(501),new util.BN(50),new util.BN(0),new util.BN(0),
      new util.BN(1),new util.BN(327),new util.BN(377),new util.BN(0),new util.BN(0),currentBlock);
   assertChannelState(assert,
      engine2,channelAddress,
      new util.BN(1),new util.BN(327),new util.BN(377),new util.BN(0),new util.BN(0),
      new util.BN(1),new util.BN(501),new util.BN(50),new util.BN(0),new util.BN(0),currentBlock);

    //now engine(0) tries to send more money then it has
    try{
      engine.sendDirectTransfer(pk_addr[1].address, new util.BN(501+328));
    }catch(err){
      //GOOD we caught it
      assert.equals(err.message, "Invalid transferredAmount: Insufficient Balance:829 > 828")
    }

    assertChannelState(assert,
      engine,channelAddress,
      new util.BN(1),new util.BN(501),new util.BN(50),new util.BN(0),new util.BN(0),
      new util.BN(1),new util.BN(327),new util.BN(377),new util.BN(0),new util.BN(0),currentBlock);
   assertChannelState(assert,
      engine2,channelAddress,
      new util.BN(1),new util.BN(327),new util.BN(377),new util.BN(0),new util.BN(0),
      new util.BN(1),new util.BN(501),new util.BN(50),new util.BN(0),new util.BN(0),currentBlock);


    engine.sendDirectTransfer(pk_addr[1].address, new util.BN(501+327));
    msg = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length -1]);
    assert.equals(sendQueue.length,4);
    engine2.onMessage(msg);

     assertChannelState(assert,
      engine,channelAddress,
      new util.BN(2),new util.BN(501),new util.BN(501+327),new util.BN(0),new util.BN(0),
      new util.BN(1),new util.BN(327),new util.BN(377),new util.BN(0),new util.BN(0),currentBlock);
   assertChannelState(assert,
      engine2,channelAddress,
      new util.BN(1),new util.BN(327),new util.BN(377),new util.BN(0),new util.BN(0),
      new util.BN(2),new util.BN(501),new util.BN(501+327),new util.BN(0),new util.BN(0),currentBlock);

   engine.closeChannel(channelAddress);
   console.log(engine.channels[channelAddress.toString('hex')].state);
   assert.equals(engine.channels[channelAddress.toString('hex')].state, channel.CHANNEL_STATE_IS_CLOSING);
   assert.equals(engine2.channels[channelAddress.toString('hex')].state, channel.CHANNEL_STATE_OPEN);



    assert.end();
  })

  t.test("component test: e2e engine mediated transfer", function (assert) {

    var sendQueue = [];
    var blockchainQueue = [];
    var currentBlock = new util.BN(0);


    var engine = createEngine(0);
    var engine2 = createEngine(1);


    //SETUP AND DEPOSIT FOR ENGINES
     engine.send = function  (msg) {
      sendQueue.push(message.SERIALIZE(msg));
    }

    engine2.send = function  (msg) {
      sendQueue.push(message.SERIALIZE(msg));
    }

    engine.blockchain = function (msg)  {
      blockchainQueue.push(msg);
    }
    engine2.blockchain = function (msg)  {
      blockchainQueue.push(msg);
    }

    engine.onNewChannel(channelAddress,
      pk_addr[0].address,
      new util.BN(501),
      pk_addr[1].address,
      new util.BN(0));
    engine2.onNewChannel(channelAddress,
      pk_addr[0].address,
      new util.BN(501),
      pk_addr[1].address,
      new util.BN(0))



    engine.onDeposited(channelAddress,pk_addr[1].address, new util.BN(327));
    engine2.onDeposited(channelAddress,pk_addr[1].address, new util.BN(327));


    assertChannelState(assert,
      engine,channelAddress,
      new util.BN(0),new util.BN(501),new util.BN(0),new util.BN(0),new util.BN(0),
      new util.BN(0),new util.BN(327),new util.BN(0),new util.BN(0),new util.BN(0),currentBlock);
    assert.equals(engine.channelByPeer.hasOwnProperty(pk_addr[1].address.toString('hex')),true);
    assertChannelState(assert,
    engine2,channelAddress,
      new util.BN(0),new util.BN(327),new util.BN(0),new util.BN(0),new util.BN(0),
      new util.BN(0),new util.BN(501),new util.BN(0),new util.BN(0),new util.BN(0),currentBlock);

    //END SETUP


    currentBlock = currentBlock.add(new util.BN(1));

    //START  A DIRECT TRANSFER FROM ENGINE(0) to ENGINE(1)

    assert.equals(sendQueue.length, 0, "send direct transfer");

    //to,target,amount,expiration,secret,hashLock
    var secretHashPair = message.GenerateRandomSecretHashPair();

   engine.sendMediatedTransfer(
      pk_addr[1].address,
      pk_addr[1].address,
      new util.BN(50),
      currentBlock.add(new util.BN(channel.REVEAL_TIMEOUT)).add(new util.BN(1)),
      secretHashPair.secret,
      secretHashPair.hash,
      );

    assert.equals(sendQueue.length, 1, "medited transfer in send queue");
    assertChannelState(assert,
      engine,channelAddress,
      new util.BN(1),new util.BN(501),new util.BN(0),new util.BN(50),new util.BN(0),
      new util.BN(0),new util.BN(327),new util.BN(0),new util.BN(0),new util.BN(0),currentBlock);

    assertChannelState(assert,
    engine2,channelAddress,
      new util.BN(0),new util.BN(327),new util.BN(0),new util.BN(0),new util.BN(0),
      new util.BN(0),new util.BN(501),new util.BN(0),new util.BN(0),new util.BN(0),currentBlock);
    //console.log(mt.to.toString('hex') +":"+ pk_addr[1].address.toString('hex'));
    var mediatedTransfer = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length -1]);

    engine2.onMessage(mediatedTransfer);
    assert.equals(sendQueue.length, 2, "requestSecret in send queu");
    //console.log(engine.channelByPeer[pk_addr[1].address.toString('hex')]);

    assertChannelState(assert,
      engine,channelAddress,
      new util.BN(1),new util.BN(501),new util.BN(0),new util.BN(50),new util.BN(0),
      new util.BN(0),new util.BN(327),new util.BN(0),new util.BN(0),new util.BN(0),currentBlock);

    assertChannelState(assert,
    engine2,channelAddress,
      new util.BN(0),new util.BN(327),new util.BN(0),new util.BN(0),new util.BN(0),
      new util.BN(1),new util.BN(501),new util.BN(0),new util.BN(50),new util.BN(0),currentBlock);


    var requestSecret = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length - 1]);
    engine.onMessage(requestSecret);
    assert.equals(sendQueue.length, 3, "reveal secret in send queue from initiator -> target");
    var revealSecretInitiator = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length -1]);
    assert.equals(revealSecretInitiator.from.compare(pk_addr[0].address),0, "reveal secret signed by initiator");

    engine2.onMessage(revealSecretInitiator);

    assert.equals(sendQueue.length, 4, "reveal secret in send queue from target -> initiator");
    var revealSecretTarget = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length -1]);
    assert.equals(revealSecretTarget.from.compare(pk_addr[1].address),0, "reveal secret signed by initiator");
    console.log(revealSecretTarget);
    engine.onMessage(revealSecretTarget);

    console.log(engine.channels[channelAddress.toString('hex')].myState);
    console.log(engine2.channels[channelAddress.toString('hex')].peerState);

     assertChannelState(assert,
      engine,channelAddress,
      new util.BN(2),new util.BN(501),new util.BN(50),new util.BN(0),new util.BN(0),
      new util.BN(0),new util.BN(327),new util.BN(0),new util.BN(0),new util.BN(0),currentBlock);

    assertChannelState(assert,
    engine2,channelAddress,
      new util.BN(0),new util.BN(327),new util.BN(0),new util.BN(0),new util.BN(0),
      new util.BN(1),new util.BN(501),new util.BN(0),new util.BN(0),new util.BN(50),currentBlock);

     assert.equals(sendQueue.length, 5, "reveal secret in send queue from target -> initiator");
      var secretToProof = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length -1]);
     assert.equals(secretToProof instanceof message.SecretToProof,true, "secretToProof generated by initiator");
     engine2.onMessage(secretToProof);


     //final states synchronized
      assertChannelState(assert,
      engine,channelAddress,
      new util.BN(2),new util.BN(501),new util.BN(50),new util.BN(0),new util.BN(0),
      new util.BN(0),new util.BN(327),new util.BN(0),new util.BN(0),new util.BN(0),currentBlock);

    assertChannelState(assert,
    engine2,channelAddress,
      new util.BN(0),new util.BN(327),new util.BN(0),new util.BN(0),new util.BN(0),
      new util.BN(2),new util.BN(501),new util.BN(50),new util.BN(0),new util.BN(0),currentBlock);

    //engine 2 initiate close
    assert.equals(engine.channels[channelAddress.toString('hex')].state, channel.CHANNEL_STATE_OPEN);
     assert.equals(engine2.channels[channelAddress.toString('hex')].state, channel.CHANNEL_STATE_OPEN);
    engine2.closeChannel(channelAddress);
    assert.equals(engine.channels[channelAddress.toString('hex')].state, channel.CHANNEL_STATE_OPEN);
    assert.equals(engine2.channels[channelAddress.toString('hex')].state, channel.CHANNEL_STATE_IS_CLOSING);


    assert.equals(blockchainQueue.length, 2, "blockchain");
    assert.equals(blockchainQueue[0][0],"CLOSE_CHANNEL");
    assert.equals(blockchainQueue[1][0],"WITHDRAW_LOCKS");

     //blockchain responds with close events
    blockchainQueue = [];
    currentBlock =currentBlock.add(new util.BN(1));
    engine.onClosed(channelAddress,currentBlock);
    assert.equals(engine.channels[channelAddress.toString('hex')].state, channel.CHANNEL_STATE_CLOSED);
    assert.equals(engine2.channels[channelAddress.toString('hex')].state, channel.CHANNEL_STATE_IS_CLOSING);
    assert.equals(blockchainQueue.length, 0,"engine(2) didnt send any transfers to engine(1) so no close proof needed by engine(1)");



    assert.end();
  })

  t.test('lock expires on engine handleBlock',function (assert) {
    var blockchainQueue = [];
    var currentBlock = new util.BN(0);

    var engine = createEngine(0);
    var engine2 = createEngine(1);

    engine.blockchain = function (msg)  {
      blockchainQueue.push(msg);
    }
    engine2.blockchain = function (msg)  {
      blockchainQueue.push(msg);
    }

    engine.onNewChannel(channelAddress,
      pk_addr[0].address,
      new util.BN(501),
      pk_addr[1].address,
      new util.BN(0));
    engine2.onNewChannel(channelAddress,
      pk_addr[0].address,
      new util.BN(501),
      pk_addr[1].address,
      new util.BN(0))



    engine.onDeposited(channelAddress,pk_addr[1].address, new util.BN(327));
    engine2.onDeposited(channelAddress,pk_addr[1].address, new util.BN(327));


    assertChannelState(assert,
      engine,channelAddress,
      new util.BN(0),new util.BN(501),new util.BN(0),new util.BN(0),new util.BN(0),
      new util.BN(0),new util.BN(327),new util.BN(0),new util.BN(0),new util.BN(0),currentBlock);
    assert.equals(engine.channelByPeer.hasOwnProperty(pk_addr[1].address.toString('hex')),true);
    assertChannelState(assert,
    engine2,channelAddress,
      new util.BN(0),new util.BN(327),new util.BN(0),new util.BN(0),new util.BN(0),
      new util.BN(0),new util.BN(501),new util.BN(0),new util.BN(0),new util.BN(0),currentBlock);

    //END SETUP
    var secretHashPair = message.GenerateRandomSecretHashPair();

    var testEventBus = new TestEventBus();
    testEventBus.addEngine(engine);
    testEventBus.addEngine(engine2);
    engine.sendMediatedTransfer(
      pk_addr[1].address,
      pk_addr[1].address,
      new util.BN(50),
      currentBlock.add(new util.BN(channel.REVEAL_TIMEOUT)).add(new util.BN(1)),
      secretHashPair.secret,
      secretHashPair.hash,
      );

     testEventBus.on('afterReceiving-4',function (msg) {
      //we applied the revealSecret and secretToProof locally, now we are just waiting for other endpoint
      //to sync
      assertChannelState(assert,
      engine,channelAddress,
      new util.BN(2),new util.BN(501),new util.BN(50),new util.BN(0),new util.BN(0),
      new util.BN(0),new util.BN(327),new util.BN(0),new util.BN(0),new util.BN(0),currentBlock);

      assertChannelState(assert,
      engine2,channelAddress,
        new util.BN(0),new util.BN(327),new util.BN(0),new util.BN(0),new util.BN(0),
        new util.BN(1),new util.BN(501),new util.BN(0),new util.BN(0),new util.BN(50),currentBlock);
    });
    testEventBus.on('afterReceiving-5',function () {

      assertChannelState(assert,
      engine,channelAddress,
      new util.BN(2),new util.BN(501),new util.BN(50),new util.BN(0),new util.BN(0),
      new util.BN(0),new util.BN(327),new util.BN(0),new util.BN(0),new util.BN(0),currentBlock);

      assertChannelState(assert,
      engine2,channelAddress,
        new util.BN(0),new util.BN(327),new util.BN(0),new util.BN(0),new util.BN(0),
        new util.BN(2),new util.BN(501),new util.BN(50),new util.BN(0),new util.BN(0),currentBlock);


      var secretHashPair = message.GenerateRandomSecretHashPair();


      engine2.sendMediatedTransfer(
        pk_addr[0].address,
        pk_addr[0].address,
        new util.BN(120),
        currentBlock.add(new util.BN(channel.REVEAL_TIMEOUT)).add(new util.BN(1)),
        secretHashPair.secret,
        secretHashPair.hash,
      );

      testEventBus.on('afterReceiving-10',function () {

        assertChannelState(assert,
      engine,channelAddress,
      new util.BN(2),new util.BN(501),new util.BN(50),new util.BN(0),new util.BN(0),
      new util.BN(2),new util.BN(327),new util.BN(120),new util.BN(0),new util.BN(0),currentBlock);

      assertChannelState(assert,
      engine2,channelAddress,
        new util.BN(2),new util.BN(327),new util.BN(120),new util.BN(0),new util.BN(0),
        new util.BN(2),new util.BN(501),new util.BN(50),new util.BN(0),new util.BN(0),currentBlock);

       var tt = engine.channels[channelAddress.toString('hex')];
      console.log("ENGINE1 transfferrable my->peer",tt.transferrableFromTo(tt.myState,tt.peerState).toString(10));
      console.log("ENGINE1 transfferrable peer->my",tt.transferrableFromTo(tt.peerState,tt.myState).toString(10));
      tt = engine2.channels[channelAddress.toString('hex')];
      console.log("ENGINE2 transfferrable my->peer",tt.transferrableFromTo(tt.myState,tt.peerState).toString(10));
      console.log("ENGINE2 transfferrable peer->my",tt.transferrableFromTo(tt.peerState,tt.myState).toString(10));




      testEventBus.on('beforeSending-11',function (msg) {
        console.log(msg);
        throw new Error();
        assertChannelState(assert,
      engine,channelAddress,
      new util.BN(2),new util.BN(501),new util.BN(50),new util.BN(0),new util.BN(0),
      new util.BN(2),new util.BN(327),new util.BN(120),new util.BN(0),new util.BN(0),currentBlock);

      assertChannelState(assert,
      engine2,channelAddress,
        new util.BN(2),new util.BN(327),new util.BN(120),new util.BN(0),new util.BN(0),
        new util.BN(2),new util.BN(501),new util.BN(50),new util.BN(0),new util.BN(0),currentBlock);


      });

      setTimeout(function(){
       engine2.sendDirectTransfer(pk_addr[0].address, new util.BN(100+120));
     },1000);

      });




    });
    assert.end();
  })

  t.test('expired open lock causes channel to close');

  t.test('blockchain events');

});

