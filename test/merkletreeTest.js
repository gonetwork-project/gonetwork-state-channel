/*
* @Author: amitshah
* @Date:   2018-04-09 12:58:48
* @Last Modified by:   amitshah
* @Last Modified time: 2018-04-18 00:54:23
*/
var test = require('tape');
var merkletree_lib = require('../src/merkletree');


var elements = [];
for(var i=0; i < 10; i++){
  elements.push(util.sha3("elem"+i));
}
var merkletree = new merkletree_lib.MerkleTree(elements);

merkletree.generateHashTree();

printTree(merkletree);

var proof = merkletree.generateProof(elements[9]);
console.log("=============== MERKLE PROOF GENERATED =================");
for(var i =0; i < proof.length; i++){
  var p = proof[i];
  console.log(util.addHexPrefix(p.toString('hex')))
}
debugger;
var verified= merkletree_lib.checkMerkleProof(proof,merkletree.getRoot(),elements[9], 5+1 );
debugger;

proof = merkletree.generateProof(merkletree.levels[0][9]);
verified = merkletree_lib.checkMerkleProof(proof,merkletree.getRoot(),merkletree.levels[0][9], 9+1);
debugger;

merkletree = new merkletree_lib.MerkleTree(elements,true);

merkletree.generateHashTree();
printTree(merkletree);

var proof = merkletree.generateProof(elements[9]);
console.log("=============== MERKLE PROOF GENERATED =================");
for(var i =0; i < proof.length; i++){
  var p = proof[i];
  console.log(util.addHexPrefix(p.toString('hex')))
}
debugger;
var verified= merkletree_lib.checkMerkleProof(proof,merkletree.getRoot(),elements[9], 9+1 );
debugger;