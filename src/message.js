const util = require('ethereumjs-util')
const sjcl = require('sjcl');
const rlp = require('rlp');
const abi = require("ethereumjs-abi");

//empty 32 byte buffer
EMPTY_32BYTE_BUFFER= Buffer.alloc(32);
EMPTY_20BYTE_BUFFER = Buffer.alloc(20);

//TODO: handle out of bounds values for Proof Messages
class Hashable{
  getMessageHash(){
    throw new Error("unimplemented getMessageHash");
  }
}
function TO_BN(value){
  if(util.BN.isBN(value)){
    return value;
  }else{
    return new util.BN(value,16);
  }
}
//we need to handle buffer serialization and deserialization
function JSON_REVIVER_FUNC(k,v) {
      if (
      v !== null            &&
      typeof v === 'object' &&
      'type' in v           &&
      v.type === 'Buffer'   &&
      'data' in v           &&
      Array.isArray(v.data)) {
        return new util.toBuffer(v.data);
      }
      return v;
}

function SERIALIZE(msg){
  return JSON.stringify(msg);
}

function DESERIALIZE(data){
  return JSON.parse(data, JSON_REVIVER_FUNC);
}

function DESERIALIZE_AND_DECODE_MESSAGE(data){
  var jsonObj = DESERIALIZE(data);
  if(jsonObj.hasOwnProperty("classType")){
    switch(jsonObj.classType){
      case "SignedMessage":
        return new SignedMessage(jsonObj);
      case "Proof":
        return new Proof(jsonObj);
      case "ProofMessage":
        return new ProofMessage(jsonObj);
      case "Lock":
        return new Lock(jsonObj);
      case "OpenLock":
        return new OpenLock(jsonObj);
      case "DirectTransfer":
        return new DirectTransfer(jsonObj);
      case "LockedTransfer":
        return new LockedTransfer(jsonObj);
      case "MediatedTransfer":
        return new MediatedTransfer(jsonObj);
      case "RequestSecret":
        return new RequestSecret(jsonObj);
      case "RevealSecret":
        return new RevealSecret(jsonObj);
      case "SecretToProof":
        return new SecretToProof(jsonObj);
      case "Ack":
        return new Ack(jsonObj);
      default:
        throw new Error("Invalid Message: unknown classType")
    }
  }
  throw new Error("Invalid Message: not a recoginized GOT message type");
}
//Messages that merely require signing extend this Base Class
class SignedMessage{

  constructor(options){
    this.classType = this.constructor.name;
    this.signature = options.signature || null;
  }
  //pack this object for signing
  getHash(){
    throw Error("unimplemented getHash()");
  }

  sign(privateKey){

    //Geth and thus web3 prepends the string \x19Ethereum Signed Message:\n<length of message>
    //to all data before signing it (https://github.com/ethereum/wiki/wiki/JSON-RPC#eth_sign).
    //If you want to verify such a signature from Solidity from web3/geth, you'll have to prepend
    //the same string in solidity before doing the ecrecovery.
    var buffer = this.getHash();
    console.log("SIGNING buffer:"+ buffer.toString('hex'));
    this.signature = util.ecsign(buffer,privateKey);
  }

  _recoverAddress(){
     var buffer = this.getHash();
     var pk = util.ecrecover(buffer,this.signature.v,util.toBuffer(this.signature.r),util.toBuffer(this.signature.s));
     var address = util.pubToAddress(pk);
     return address;
  }

  get from() {
    if(!this.signature){
      throw new Error("no signature to recover address from");
    }
    return this._recoverAddress();
  }

  isSigned(){
    return !(this.signature === null);
  }

}

//Messages that encapsulate an on chain proof extend ProofMessage base class
//A proof message maybe submitted onchain during settlement to allocate your funds
class Proof extends SignedMessage{

  constructor(options){
    super(options);
    this.nonce = TO_BN(options.nonce) || new util.BN(0);
    this.transferredAmount = TO_BN(options.transferredAmount) || new util.BN(0);
    this.locksRoot = options.locksRoot || EMPTY_32BYTE_BUFFER;
    this.channelAddress = options.channelAddress || EMPTY_20BYTE_BUFFER;
    this.messageHash = options.messageHash || EMPTY_32BYTE_BUFFER;
    this.signature = options.signature || null;
  }

  getHash(){
    var solidityHash = abi.soliditySHA3(
     [ "uint256", "uint256", "address","bytes32","bytes32" ],
     [this.nonce,
      this.transferredAmount,
      this.channelAddress,
      this.locksRoot,
      this.messageHash]);
    return solidityHash;

  }


}
class ProofMessage extends SignedMessage{

  constructor(options){
    super(options);

    this.nonce = TO_BN(options.nonce) || new util.BN(0);
    this.transferredAmount = TO_BN(options.transferredAmount) || new util.BN(0);
    this.locksRoot = options.locksRoot || EMPTY_32BYTE_BUFFER;
    this.channelAddress = options.channelAddress || EMPTY_20BYTE_BUFFER;
    this.messageHash = options.messageHash || EMPTY_32BYTE_BUFFER;
    this.signature = options.signature || null;

  }

  getHash(){
    var solidityHash = abi.soliditySHA3(
     [ "uint256", "uint256", "address","bytes32","bytes32" ],
     [this.nonce,
      this.transferredAmount,
      this.channelAddress,
      this.locksRoot,
      this.getMessageHash()]);
    return solidityHash;
  }

  getMessageHash(){
    throw new Error("unimplemented getMessageHash");
  }

  toProof(){
    return new Proof({
      nonce:this.nonce,
      transferredAmount:this.transferredAmount,
      locksRoot:this.locksRoot,
      channelAddress:this.channelAddress,
      messageHash:this.getMessageHash(),
      signature:this.signature
    });

  }

}

//A lock is included as part of a LockedTransfer message
class Lock extends Hashable{

  constructor(options){
    super(options);

    this.amount = TO_BN(options.amount) || new util.BN(0);
    this.expiration= TO_BN(options.expiration) || new util.BN(0);
    this.hashLock = options.hashLock || EMPTY_32BYTE_BUFFER;
  }

  getMessageHash(){
    var hash =  abi.soliditySHA3(['uint256','uint256','bytes32'],[
      this.amount, this.expiration, this.hashLock]);
    return hash;
  }

  encode(){
    var value = abi.solidityPack(['uint256','uint256','bytes32'],[
      this.amount, this.expiration, this.hashLock]);
    return value;
  }

}

class OpenLock extends Lock{

  constructor(lock,secret){
    super(lock);
    this.secret = secret;
  }

  encode(){
    var value = abi.solidityPack(['uint256','uint256','bytes32','bytes32'],[
      this.amount, this.expiration, this.hashLock,this.secret]);
    return value;
  }
}


class DirectTransfer extends ProofMessage{

  constructor(options){
    super(options);

    this.msgID = TO_BN(options.msgID) || new util.BN(0);
    this.to = options.to || EMPTY_20BYTE_BUFFER;

  }

  getMessageHash(){
     var solidityHash = abi.soliditySHA3(
     ["uint256",  "uint256", "uint256", "address","bytes32","address"],
     [this.msgID,
      this.nonce,
      this.transferredAmount,
      this.channelAddress,
      this.locksRoot,
      this.to]);
    return solidityHash;
  }
}

class LockedTransfer extends DirectTransfer{

  constructor(options){
    super(options);
    if(!options.lock){
      options.lock = new Lock({});
    }else if(options.lock instanceof Lock){
      this.lock = options.lock;
    }else if( options.lock instanceof Object){
      this.lock = new Lock(options.lock);
    }
  }

  getMessageHash(){
     var solidityHash = abi.soliditySHA3(
     ["uint256",  "uint256", "uint256", "address","bytes32","address","bytes32" ],
     [this.msgID,
      this.nonce,
      this.transferredAmount,
      this.channelAddress,
      this.locksRoot,
      this.to,
      this.lock.getMessageHash()]);
    return solidityHash;
  }

}

class MediatedTransfer extends LockedTransfer{

  constructor(options){
    super(options);
    this.target = options.target || EMPTY_20BYTE_BUFFER; //EthAddress
    this.initiator = options.initiator || EMPTY_20BYTE_BUFFER;//EthAddress
  }

  getMessageHash(){
     var solidityHash = abi.soliditySHA3(
     ["uint256",  "uint256", "uint256", "address","bytes32","address","address","address","bytes32" ],
     [this.msgID,
      this.nonce,
      this.transferredAmount,
      this.channelAddress,
      this.locksRoot,
      this.to,
      this.target,
      this.initiator,
      this.lock.getMessageHash()]);
    return solidityHash;
  }
}

class RequestSecret extends SignedMessage{

  constructor(options){
    super(options);
    this.msgID = TO_BN(options.msgID) || new util.BN(0);
    this.to = options.to || EMPTY_20BYTE_BUFFER;
    this.hashLock = options.hashLock || EMPTY_32BYTE_BUFFER; //Serializable Lock Object
    this.amount = TO_BN(options.amount) || util.BN(0);
  }

  getHash(){
    //we cannot include the expiration as this value is modified by hops at times
    return abi.soliditySHA3(
     [ "uint256", "address", "bytes32","uint256"],
     [this.msgID,this.to, this.hashLock, this.amount]
     );
  }
}

class RevealSecret extends SignedMessage{

  constructor(options){
    super(options);
    this.secret = options.secret || EMPTY_32BYTE_BUFFER;
    this.to = options.to || EMPTY_20BYTE_BUFFER;
  }

   getHash(){
     var solidityHash = abi.soliditySHA3(
     [ "bytes32", "address"],
     [this.secret,
      this.to]);
    return solidityHash;
  }

  get hashLock(){
    return util.sha3(this.secret);
  }
}

//Once a secret is known, if we want to keep the payment channel alive longer
//then the min(openLocks.expired) block, then convert the lock into a balance proof
//using this message.  Without it, we will have to close channel and withdraw on chain
class SecretToProof extends ProofMessage{

  constructor(options){
    super(options);
    this.msgID = TO_BN(options.msgID) || new util.BN(0);
    this.to = options.to || EMPTY_20BYTE_BUFFER;
    this.secret = options.secret || EMPTY_32BYTE_BUFFER;
  }

  getMessageHash(){
     var solidityHash = abi.soliditySHA3(
     [ "uint256", "uint256", "uint256", "address","bytes32","address","bytes32" ],
     [this.msgID,
      this.nonce,
      this.transferredAmount,
      this.channelAddress,
      this.locksRoot, // locksRoot - sha3(secret)
      this.to,
      this.secret]);
    return solidityHash;
  }

  get hashLock(){
    return util.sha3(this.secret);
  }

}

//Note: We initially avoid signing acks because it basically
//gives an attacker a valid message signature by the signer (which is not intended)
class Ack{

  constructor(options){
    this.to = options.to || EMPTY_20BYTE_BUFFER;
    this.messageHash = options.messageHash || EMPTY_32BYTE_BUFFER;
  }
}

//entropy collector
function StartEntropyCollector(){
  sjcl.random.startCollectors();
}
//GLOBAL functions
function GenerateRandomSecretHashPair(){
  var randomBuffer = sjcl.random.randomWords(256/(4*8));
  var secret = util.addHexPrefix(sjcl.codec.hex.fromBits(randomBuffer));
  var hash= util.sha3(secret);
  return {'secret': secret, 'hash':hash};
}



module.exports= {
  SignedMessage,ProofMessage,DirectTransfer,LockedTransfer,MediatedTransfer,
  RequestSecret,RevealSecret,SecretToProof,Ack,Lock, JSON_REVIVER_FUNC,
  GenerateRandomSecretHashPair,StartEntropyCollector,TO_BN,OpenLock,SERIALIZE,DESERIALIZE,DESERIALIZE_AND_DECODE_MESSAGE
}
