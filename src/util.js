const tx = require('ethereumjs-tx')
const util = require('ethereumjs-util')
const sjcl = require('sjcl-all');
const rlp = require('rlp');
const abi = require("ethereumjs-abi");
//https://github.com/ethereumjs/keythereum
//const keythereum = require("keythereum");

//TODO: consider having random injected from kSec
//https://books.google.ca/books?id=M-KRCgAAQBAJ&pg=PA61&lpg=PA61&dq=window.crypto.getRandomValues+256+bit&source=bl&ots=b6jXRKYEUq&sig=09-MbFPMb3Xs5oNSZUj1g77F4NQ&hl=en&sa=X&ved=0ahUKEwi5hdrCuqHZAhUCOKwKHWzFCWIQ6AEIXDAG#v=onepage&q=window.crypto.getRandomValues%20256%20bit&f=false


//channel Re-Balance
//Background: Rather then funding every channel via a transaction, a party may chose to rebalance a channel offchain.
//This scenario is useful if Party B was something like coinbase:
//One of the 2 parties may initiate an onchain transfer via a lock, that rebalances the transfer of the state
//Party B requests a re balance
//Party A creates a hashLock and sends the transaction off chain
//Party B creates a hashLock with the same hash and sets it on chain
//Party A claims the hashLock from party B by presenting the secret
//Party B now has the secret that also unlocks the offchain transfer

function createLockTransfer(secret, amount){


}

function createEntropy(){
  //TODO:mousemove entropy
}

function loadContract(){
  // need to have the ABI definition in JSON as per specification
  var tokenAbi = [{"constant":true,"inputs":[{"name":"","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"type":"function"},{"constant":false,"inputs":[{"name":"_to","type":"address"},{"name":"_value","type":"uint256"}],"name":"transfer","outputs":[{"name":"success","type":"bool"}],"type":"function"},{"inputs":[],"type":"constructor"}]

  var encoded = abi.encode(tokenAbi, "balanceOf(uint256 address)", [ "0x0000000000000000000000000000000000000000" ])

  var decoded = abi.decode(tokenAbi, "balanceOf(uint256 address)", data)

}



// {
//   channelId: <bytes20> channelAddress hexString
//   balance_a: <uint256> bigNUmber
//   balance_b: <uint256> bigNUmber
//   balanceProof: <merkle hashroot of all balanceTransfer (in and out) bytes32>
//   //we use the balance proof if we want to create a bidirectional payment channel
//   lockRoot: <merkle lockRoot bytes32> //this helps us identify how many outstanding locks are in the network related to this balance
//   signature: <64 bytes> hex string
//   to: bytes20 hexString //are these actually needed?
//   from: bytes20 hexString //are these needed if we have athe channelId?
// }

//Receiver must be notified if the channel is overdrawn before they accept the transfer
//Message Types:
//SendTransfer (encapsulate various Transfers)
//RequestSecret
//AcceptTransfer
//OpenChannel
//CloseChannel
//SettleChannel

//When a particular request is Accepted, onAcceptTransfer -> move from pendinging merkleTree to finalized merkleTree

  //nonce
  //transferred amount
  //locksoort
  //contract_address
  //extra_hash
//get transaction from txReceipt
//get block and decode the transaction
// var receipt = web3.eth.getTransactionReceipt('0x9fc76417374aa880d4449a1f7f31ec597f00b1f6f3dd2d66f4c9c6c445836d8b');
// console.log(receipt);
// {
//   "transactionHash": "0x9fc76417374aa880d4449a1f7f31ec597f00b1f6f3dd2d66f4c9c6c445836d8b",
//   "transactionIndex": 0,
//   "blockHash": "0xef95f2f1ed3ca60b048b4bf67cde2195961e0bba6f70bcbea9a2c4e133e34b46",
//   "blockNumber": 3,
//   "contractAddress": "0xa94f5374fce5edbc8e2a8697c15331677e6ebf0b",
//   "cumulativeGasUsed": 314159,
//   "gasUsed": 30234,
//   "logs": [{
//          // logs as returned by getFilterLogs, etc.
//      }, ...],
//   "status": "0x1"
// }
//var transaction = web3.getTransaction(receipt.transactionHash);
//var txInput =
function decodeTx(){
  const rawTxStr = '0x...'
  const decodedRawTx = rlp.decode(rawTxStr)
  const transaction = new tx.Transaction(decodedRawTx)
  console.log(transaction.verifySignature())

}

  //lightening style unilateral close with relative timeout
  //channelId = 0x prefix address string
  //random_hash = 0x prefix 32 byte hash string
  //transfer_amount = monotonically increasing transfer amount

  //Discussion:we dont need a fraud proof secret reveal like
  //ligtning network because of monotonic transfer_amount function.
  //the nonce also gives us strong ordering so for future value functions that dont
  // have the same properties as currency transfer
function Transfer(options){
  this.className = "Transfer";
  this.channelId = options.channelId || null; //hexstring address
  this.transfer_amount = options.transfer_amount || new util.BN(0); //BN
  this.nonce = options.nonce || new util.BN(0); //BN
  if(!options.random_hash){
      options.random_hash = ((generateRandomHash()).hash).toString("hex");
  }
  this.random_hash = options.random_hash;

  this.sig = options.sig|| null;
  this.from = options.from || null;
}

function serializeTransfer(transfer){
  return JSON.stringify(transfer);
}
function deserializeTransfer(transferData){
  return new Transfer(JSON.parse(transferData));
}

Transfer.prototype.getSignableHash = function(){
  //tightly pack params as that is how solidity does it
  //this varies from rlp encoding slightly
  var buffer =  abi.soliditySHA3(
     [ "address", "uint256", "uint256", "bytes32" ],
     [ util.addHexPrefix(this.channelId),
      this.transfer_amount,
      this.nonce,
      util.toBuffer(util.addHexPrefix(this.random_hash))]);
  return buffer;
}

Transfer.prototype.verify = function(from){
  var buffer = this.getSignableHash();
  var pk = util.ecrecover(buffer,this.sig.v,util.toBuffer(this.sig.r),util.toBuffer(this.sig.s));
  var address = util.pubToAddress(pk);
  console.log("VERIFY TX:"+ (util.addHexPrefix(address.toString("hex")) === from));
  return (util.addHexPrefix(address.toString("hex")) === from)
}

//a mutable operation that updates the sign property
Transfer.prototype.sign = function(privateKey) {
  var buffer = this.getSignableHash();
  var sig = util.ecsign(buffer, privateKey);
  this.sig = {};
  this.sig.r = util.addHexPrefix(sig.r.toString("hex"));
  this.sig.s = util.addHexPrefix(sig.s.toString("hex"));
  this.sig.v = sig.v;
}

//https://en.bitcoin.it/wiki/Atomic_cross-chain_trading
function LockTransfer(options){
  this._super.call(this,options);
  if(!options.lock){
    options.lock = generateRandomHash();
  }

  this.lock = options.lock;
  Object.defineProperty(this.lock, "secret", {enumerable:false});
}

LockTransfer.prototype = Object.create(Transfer.prototype);

LockTransfer.prototype.constructor = LockTransfer;

LockTransfer.prototype._super = Transfer;

LockTransfer.prototype.getSignableHash = function(){
  var buffer =  abi.soliditySHA3(
     [ "address", "uint256", "uint256", "bytes32","bytes32" ],
     [ util.addHexPrefix(this.channelId),
      this.transfer_amount,
      this.nonce,
      util.toBuffer(util.addHexPrefix(this.random_hash)),
      util.toBuffer(util.addHexPrefix(this.lock.hash))]);
  return buffer;
};

//entropy collector
sjcl.random.startCollectors();
//GLOBAL functions
function generateRandomHash(){
  var randomBuffer = sjcl.random.randomWords(256/(4*8));
  var secret = util.addHexPrefix(sjcl.codec.hex.fromBits(randomBuffer));
  var hash= util.sha3(secret);
  return {'secret': secret, 'hash':hash};
}

//ON-CHAIN functions allowing for atomic swaps
function AtomicSwapInitiate(){
  var lock = generateRandomHash();
  //create contract with lock.
  //send lock to endpoint
}

function AtomicSwapParticpate(lock_hash){
  //create contract where hash unlocks your funds
}

var privateKey =  util.toBuffer('0xe331b6d69882b4cb4ea581d88e0b604039a3de5967688d3dcffdd2270c0fd109');
var publicKey =util.privateToPublic(privateKey);
var address = util.pubToAddress(publicKey);
var channelAddress = address.toString("hex");
var t = new Transfer({"from":address, transfer_amount:new util.BN(10), nonce: new util.BN(1),channelId:channelAddress });

t.sign(privateKey);

console.log(t.verify("0xbe862ad9abfe6f22bcb087716c7d89a26051f74c"));
debugger;
var lt = new LockTransfer({"from":address, transfer_amount:new util.BN(10), nonce: new util.BN(1),channelId:channelAddress });
lt.sign(privateKey);
console.log(lt.verify("0xbe862ad9abfe6f22bcb087716c7d89a26051f74c"));
console.log(util.sha3(lt.lock.secret).toString("hex") + ":" + lt.lock.hash.toString("hex"));
//var l = new LockTransfer({"from":address, transfer_amount:new util.BN(10), nonce: new util.BN(1),channelId:channelAddress })
