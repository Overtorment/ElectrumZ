ElectrumZ
=========

Minimalistic Electrum server implementation that indexes and serves only chainstate data (aka UTXO)

With that data it can implement following RPC  methods:

* `blockchain.scripthash.get_balance`
* `blockchain.scripthash.get_history` (**limited data**)
* `blockchain.scripthash.listunspent`
* `blockchain.scripthash.subscribe` ???
* `blockchain.scripthash.unsubscribe` ???

Following methods will be proxied to Bitcoin Core:

* `blockchain.transaction.broadcast`
* `blockchain.transaction.get`

How it works:
-------------

1. Ask Bitcoin Core to dump UTXO set on disk (i.e. `bitcoin-cli dumptxoutset ~/utxos.dat latest`)
1. Parse `.dat` file into empty sqlite database
1. Add indexes
1. Ready to serve!
1. Launch worker that watches for new blocks and updates UTXOs in sqlite database


For reference
------------

* https://electrum-protocol.readthedocs.io/en/latest/protocol-methods.html