import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Keypair, Transaction,clusterApiUrl,Connection, PublicKey } from "@solana/web3.js";
import { findReference, FindReferenceError,fetchTransaction } from "@solana/pay";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base"
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import BackLink from "../components/BackLink";
import Loading from "../components/Loading";
import { MakeTransactionInputData, MakeTransactionOutputData } from "./api/makeTransaction";
import Confirmed from "../components/Confirmed";

export default function Checkout() {
  const router = useRouter();
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  // State to hold API response fields
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [succes,setSucces] = useState<boolean>(false);
  const [signature,setSignature] = useState<string>('');
  const network = WalletAdapterNetwork.Devnet
  const endpoint = clusterApiUrl(network)
  const connectionApi = new Connection(endpoint)

  // Read the URL query (which includes our chosen products)
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(router.query)) {
    if (value) {
      if (Array.isArray(value)) {
        for (const v of value) {
          searchParams.append(key, v);
        }
      } else {
        searchParams.append(key, value);
      }
    }
  }

  // Generate the unique reference which will be used for this transaction
  const reference = useMemo(() => Keypair.generate().publicKey, []);

  // Add it to the params we'll pass to the API
  searchParams.append('reference', reference.toString());

  // Use our API to fetch the transaction for the selected items
  async function getTransaction() {
    if (!publicKey) {
      return;
    }

    const body: MakeTransactionInputData = {
      account: publicKey.toString(),
    }

    const response = await fetch(`/api/makeTransaction?${searchParams.toString()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
    })

    const json = await response.json() as MakeTransactionOutputData

    if (response.status !== 200) {
      console.error(json);
      return;
    }

    // Deserialize the transaction from the response
    const transaction = Transaction.from(Buffer.from(json.transaction, 'base64'));
    setTransaction(transaction);
    setMessage(json.message);
    console.log(transaction);
  }

  useEffect(() => {
    getTransaction()
  }, [publicKey])

  // Send the fetched transaction to the connected wallet
  async function trySendTransaction() {
    if (!transaction) {
      return;
    }
    try {
      await sendTransaction(transaction, connection)
    } catch (e) {
      console.error(e)
    }
  }

  // Send the transaction once it's fetched
  useEffect(() => {
    trySendTransaction()
  }, [transaction])

  // Check every 0.5s if the transaction is completed
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        // Check if there is any transaction for the reference
        await findReference(connection, reference).then(res => setSignature(res.signature));
        const pubKey = new PublicKey('7JBbggL2i58DqVN4axkxJEZRNMwWjBTFgwoatzHKSkus');
        await connection.getTransaction(
          '51xgSMBAVNop4Na5hAnDQe9nfBvdr515yUUay3nBXXBB2eJeJi85DAQTWcukJUMFjGH7AYFzK1DTxTe3fyKLEAUf'
        ).then(res => console.log(res))
        router.push('/confirmed')
        console.log('They paid!!!')
      } catch (e) {
        if (e instanceof FindReferenceError) {
          // No transaction found yet, ignore this error
          return;
        }
        console.error('Unknown error', e)
      }
    }, 500)
    return () => {
      clearInterval(interval)
    }
  }, [])

  if (!publicKey) {
    return (
      <div className='flex flex-col items-center gap-8'>
        <div><BackLink href='/'>Cancel</BackLink></div>

        <WalletMultiButton />

        <p>You need to connect your wallet to make transactions</p>
      </div>
    )
  }

  return (
    <div className='flex flex-col items-center gap-8'>
      <div><BackLink href='/'>Cancel</BackLink></div>

     <WalletMultiButton />

      {message ?
        <p>{message} Please approve the transaction using your wallet</p> :
        <p>Creating transaction... <Loading /></p>
      }
    </div>
  )
}