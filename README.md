GoNetwork State Channel Engine
==============

GoNetwork Documentations [WIP] : https://gonetwork.co/docs


Quick Start
===========

npm install

# Run Direct Transfer Test over Mqtt:

cd ./test/throughput

open 2 terminals.  Each node will connect to a publicly available mqtt client.

in terminal 1 run: 

node client2.js

in terminal 2 run:

node client1.js

# Run Mediated Transfer Test over Mqtt:

see above for setup

in terminal 1 run: 

node client2_mediated.js

in terminal 2 run:

node client1_mediated.js
