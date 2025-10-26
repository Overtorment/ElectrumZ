ElectrumZ
=========

Minimalistic Electrum server implementation that indexes and serves only chainstate data (aka UTXO)

Pros:

* takes way less disk space, ~15 Gb (with dust limit set to 1k sat)
* fast to index: all done in 30 minutes
* works: you can see your balance, and get data to construct spending transactions

Cons:

* cant serve historic data: will show only your recent transactions (the ones that have unspent outputs)
* because of the above, cant be used to import seeds in wallets from scratch: not all funds might be detected (might need huge gap_limit)
* doesnt work with mempool, so cant tell anything about unconfirmed transactions or do fee estimation based on mempool
* must be initially synced on the same machine where Bitcoin Core is (to access utxo dump)

### With that data it can implement following RPC  methods:

* `blockchain.scripthash.get_balance`
* `blockchain.scripthash.get_history` (**limited data**)
* `blockchain.scripthash.listunspent`

### Following methods will be proxied to Bitcoin Core:

* `blockchain.transaction.broadcast`
* `blockchain.transaction.get`

How it works:
-------------

1. Ask Bitcoin Core to dump UTXO set on disk (i.e. `bitcoin-cli dumptxoutset ~/utxos.dat latest`)
1. Parse `.dat` file into empty sqlite database
1. Add indexes
1. Ready to serve!
1. Launch worker that watches for new blocks and updates UTXOs in sqlite database

TLS Configuration
-----------------

The server supports TLS encryption for secure connections. TLS is enabled only when both environment variables are set to existing files:

```bash
export TLS_CERT_PATH=/path/to/your/cert.pem
export TLS_KEY_PATH=/path/to/your/key.pem
```

### Server Ports

The server runs on two ports by default:
* TCP: 50011 (configurable via `TCP_PORT` environment variable)
* TLS: 50012 (configurable via `TLS_PORT` environment variable)

If the env vars are not set or files are missing, only the TCP server will start.

TODO
----

* [x] add worker to catch up after initial data ingestion (delete spent utxos, add new utxos)
* [x] implement missing less-important JSON-RPC methods
* [x] add TLS server with certificate configuration
* [ ] add Websocket servers
* [ ] add worker to process mempool
* [ ] handle reorgs


For reference
------------

* https://electrum-protocol.readthedocs.io/en/latest/protocol-methods.html
* https://github.com/bitcoin/bitcoin/blob/master/contrib/utxo-tools/utxo_to_sqlite.py
* https://research.mempool.space/utxo-set-report/
