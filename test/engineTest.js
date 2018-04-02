const test = require('tape');
const engine = require('../src/engine');
const channel = require('../src/channel');
const util = require('ethereumjs-util');
const message = require('../src/message');

var privateKey =  util.toBuffer('0xe331b6d69882b4cb4ea581d88e0b604039a3de5967688d3dcffdd2270c0fd109');
var publicKey =util.privateToPublic(privateKey);
var channelAddress = util.pubToAddress(publicKey);

//setup global public/private key pairs
var pk_addr = [{pk:util.toBuffer('0xa63c8dec79b2c168b8b76f131df6b14a5e0a1ab0310e0ba652f39bca158884ba'),
address: util.toBuffer('0x6877cf5f9af67d622d6c665ea473e0b1a14f99d0')},
{pk:util.toBuffer('0x6f1cc905d0a87054c15f183eae89ccc8dc3a79702fdbb47ae337583d22df1a51'),
address: util.toBuffer('0x43068d574694419cb76360de33fbd177ecd9d3c6')
},
{pk:util.toBuffer('0x8dffbd99f8a386c18922a014b5356344a4ac1dbcfe32ee285c3b23239caad10d'),
address: util.toBuffer('0xe2b7c4c2e89438c2889dcf4f5ea935044b2ba2b0')
}];

function assertChannelState(assert,
      engine,channelAddress,nonce,depositBalance,transferredAmount,lockedAmount,unlockedAmount,
      peerNonce,peerDepositBalance,peerTransferredAmount,peerLockedAmount,peerUnlockedAmount,currentBlock){
  var state = engine.channels[channelAddress.toString('hex')].myState;
  assertStateBN(assert,state,nonce,depositBalance,transferredAmount,lockedAmount,unlockedAmount,currentBlock)
  state = engine.channels[channelAddress.toString('hex')].peerState;
  assertStateBN(assert, state, peerNonce,peerDepositBalance,peerTransferredAmount,peerLockedAmount,peerUnlockedAmount,currentBlock);

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


test('test engine', function(t){
  function createEngine(pkIndex){
    return new engine.Engine(pk_addr[pkIndex].address, function (msg) {
      console.log("SIGNING MESSAGE");
      msg.sign(pk_addr[pkIndex].pk)
    });

  }

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
    var currentBlock = new util.BN(0);
    var engine = createEngine(0);
    var engine2 = createEngine(1);

    //SETUP AND DEPOSIT FOR ENGINES

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

    engine.send = function  (msg) {
      console.log(message.SERIALIZE(msg));
      sendQueue.push(message.SERIALIZE(msg));
    }


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

    engine2.onMessage(msg);
    assertChannelState(assert,
      engine,channelAddress,
      new util.BN(1),new util.BN(501),new util.BN(50),new util.BN(0),new util.BN(0),
      new util.BN(0),new util.BN(327),new util.BN(0),new util.BN(0),new util.BN(0),currentBlock);
   assertChannelState(assert,
      engine2,channelAddress,
      new util.BN(0),new util.BN(327),new util.BN(0),new util.BN(0),new util.BN(0),
      new util.BN(1),new util.BN(501),new util.BN(50),new util.BN(0),new util.BN(0),currentBlock);
    assert.end();
  })


});