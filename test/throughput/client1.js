/*
* @Author: amitshah
* @Date:   2018-04-18 19:55:20
* @Last Modified by:   amitshah
* @Last Modified time: 2018-04-26 02:45:19
*/
const stateChannel = require('../../src/index.js');
const events = require('events');
const util = require('ethereumjs-util');

const {
  initP2P,
  channelAddress,
  pk1, pk2, pk3, pk4,
  acct1, acct2, acct3, acct4
} = require('../config')('ropsten');

const message = stateChannel.message;
const channel = stateChannel.channel;

function createEngine(address, privateKey, blockchainService) {
  var e = new stateChannel.Engine(address, function (msg) {
    console.log("SIGNING MESSAGE");
    msg.sign(privateKey)
  }, blockchainService);
  return e;
}
var engine = createEngine(util.toBuffer(acct1), pk1);

//#region SETUP AND DEPOSIT FOR ENGINES
engine.onChannelNew(channelAddress,
  util.toBuffer(acct1),
  util.toBuffer(acct4),
  channel.SETTLE_TIMEOUT);


engine.onChannelNewBalance(channelAddress, util.toBuffer(acct1), new util.BN(27000));
//#endregion SETUP

//START  A DIRECT TRANSFER FROM ENGINE(0) to ENGINE(1)
var cl = console.log;

start = Date.now();
var transferredAmount = new util.BN(1);

const p2pClient = initP2P(acct1)

engine.send = function (msg) {
  p2pClient.send(acct4, message.SERIALIZE(msg))
}

p2pClient.on('status-changed', (s) => {
  // console.log('STATUS', s)
  if (s === 'connected') {
    start = Date.now();
    for (var i = 0; i < 1000; i++) {
      transferredAmount = transferredAmount.add(new util.BN(1));
      engine.sendDirectTransfer(util.toBuffer(acct4), transferredAmount);
      //var msg = sendQueue[sendQueue.length -1];
    }
    end = Date.now();
    cl("Direct Transfers Sent Per SECOND per USER " + 1000 / ((end - start) / 1000));
  }
}
)


// client.on('connect', function () {
//   start = Date.now();
//   for (var i = 0; i < 1000; i++) {
//     transferredAmount = transferredAmount.add(new util.BN(1));
//     engine.sendDirectTransfer(util.toBuffer(acct4), transferredAmount);
//     //var msg = sendQueue[sendQueue.length -1];
//   }
//   end = Date.now();
//   cl("Direct Transfers Sent Per SECOND per USER " + 1000 / ((end - start) / 1000));
// })


