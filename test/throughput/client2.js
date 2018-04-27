/*
* @Author: amitshah
* @Date:   2018-04-18 19:55:20
* @Last Modified by:   amitshah
* @Last Modified time: 2018-04-26 02:49:32
*/
const stateChannel= require('../../src/index.js');
const events = require('events');
const util = require("ethereumjs-util");

const {
  initP2P,
  channelAddress,
  pk1, pk2, pk3, pk4,
  acct1, acct2, acct3, acct4
} = require('../config')('ropsten');

const message = stateChannel.message;
const channel = stateChannel.channel;

function createEngine(address,privateKey,blockchainService){
    var e =  new stateChannel.Engine(address, function (msg) {
      console.log("SIGNING MESSAGE");
      msg.sign(privateKey)
    },blockchainService);
    return e;
}

//#region SETUP
var engine2 = createEngine(util.toBuffer(acct4),pk4);
 
engine2.onChannelNew(channelAddress,
      util.toBuffer(acct1),
      util.toBuffer(acct4),
      channel.SETTLE_TIMEOUT);

engine2.onChannelNewBalance(channelAddress,util.toBuffer(acct1), new util.BN(27000));
//#endregion END SETUP


//START  A DIRECT TRANSFER FROM ENGINE(0) to ENGINE(1)
var cl = console.log;

start = Date.now();
var transferredAmount = new util.BN(1);

const p2pClient = initP2P(acct4)
 
var count=0;
var start, end;

console.log(engine2.channels[channelAddress.toString('hex')].peerState.proof);
p2pClient.on('message-received', function (m) {
  const msg = m.payload;
  // message is Buffer
  //count++;
  if(count ==0){
    start = Date.now();
  }else if(count === 999){
    var proof = engine2.channels[channelAddress.toString('hex')].issueClose();
    console.log(proof);
    end = Date.now();
     cl("Direct Transfers Processed Per SECOND per USER "+ 1000/((end - start)/1000));
  }
  console.log(m.id, count);
  var directTransfer = message.DESERIALIZE_AND_DECODE_MESSAGE(msg);
  try {
    engine2.onMessage(directTransfer);
  } catch (err) {
    console.log(err)
  }
  count++;
  // @Amit - this looks rather serious
  console.warn('I AM NOT LOGGED - MEANING .onMessage THROWN')
});
