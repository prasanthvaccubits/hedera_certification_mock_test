const {
	Client,
	PrivateKey,
	AccountCreateTransaction,
	ScheduleCreateTransaction,
	ScheduleSignTransaction,
	TransferTransaction,
	AccountBalanceQuery,
	ScheduleInfoQuery,
	Hbar,
	KeyList,
	ScheduleId,
	AccountId,
	Timestamp,
} = require('@hashgraph/sdk');
require('dotenv').config();

//Grab your Hedera testnet account ID and private key from your .env file
const {
	MY_ACCOUNT_ID,
	MY_PRIVATE_KEY,
	ADMIN_PRIVATE_KEY,
	RECEIVER_ACCOUNT_ID,
} = process.env;

const main = async () => {
	//Create new keys
	const keyPairs = await generateKeys(3);

	//Create a key list with 3 keys and require 2 signatures
	const keyList = new KeyList(keyPairs.publicKeys, 2);

	//Create a multi signature account with 1,000 tinybar starting balance
	const multiSigAccountID = await createMultiSigAccount(keyList);

	//Consoling initial balances
	await accountBalance(multiSigAccountID);
	await accountBalance(RECEIVER_ACCOUNT_ID);

	// Creating a Transaction to send 10 HBAR to MY_ACCOUNT_ID from MultiSig account
	const transaction = await createHbarTransaction(
		multiSigAccountID,
		RECEIVER_ACCOUNT_ID,
		'10'
	);

	//Schedule a transaction
	const scheduleId = await createScheduledTransaction(transaction);

	//Querying scheduled transaction info
	await queryScheduledTxn(scheduleId);

	//Submitting signatures
	await submitSignature(scheduleId, keyPairs.privateKeys[0]);
	await submitSignature(scheduleId, keyPairs.privateKeys[1]);

	//Querying scheduled transaction info to verify it is executed
	await queryScheduledTxn(scheduleId);

	//Consoling final balances
	await accountBalance(multiSigAccountID);
	await accountBalance(RECEIVER_ACCOUNT_ID);

	process.exit();
};

const getClient = async () => {
	// If we weren't able to grab it, we should throw a new error
	if (MY_ACCOUNT_ID == null || MY_PRIVATE_KEY == null) {
		throw new Error(
			'Environment variables MY_ACCOUNT_ID and MY_PRIVATE_KEY must be present'
		);
	}

	// Create our connection to the Hedera network
	return Client.forTestnet().setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);
};

const generateKeys = async (numOfKeys) => {
	const privateKeys = [];
	const publicKeys = [];

	for (let i = 0; i < numOfKeys; i++) {
		const privateKey1 = PrivateKey.generateED25519();
		const publicKey1 = privateKey1.publicKey;
		privateKeys.push(privateKey1);
		publicKeys.push(publicKey1);

		console.log(`\n\nGenerated Key Pairs ${i + 1}`);
		console.log(`Public Key: ${publicKey1.toStringRaw()}`);
		console.log(`Private Key: ${privateKey1.toStringRaw()}`);
	}

	return { privateKeys, publicKeys };
};

const createMultiSigAccount = async (keys) => {
	const client = await getClient();
	const multiSigAccount = await new AccountCreateTransaction()
		.setKey(keys)
		.setInitialBalance(Hbar.fromString('1000'))
		.execute(client);

	// Get the new account ID
	const getReceipt = await multiSigAccount.getReceipt(client);
	const multiSigAccountID = getReceipt.accountId;

	console.log(
		'\n\nThe Multi Signature Account ID is: ' + multiSigAccountID + '\n\n'
	);
	return multiSigAccountID;
};

const createHbarTransaction = async (from, to, amount) => {
	return new TransferTransaction()
		.addHbarTransfer(from, Hbar.fromString(`-${amount}`))
		.addHbarTransfer(to, Hbar.fromString(amount));
};

const createScheduledTransaction = async (transaction) => {
	const client = await getClient();
	const scheduleTransaction = new ScheduleCreateTransaction()
		.setScheduledTransaction(transaction)
		.setScheduleMemo('Scheduled TX With Multi Signature Account')
		.setAdminKey(PrivateKey.fromString(ADMIN_PRIVATE_KEY))
		.freezeWith(client);

	const signedScheduleTransaction = await scheduleTransaction.sign(
		PrivateKey.fromString(ADMIN_PRIVATE_KEY)
	);

	//Submit the transaction to a Hedera network
	const txResponse = await signedScheduleTransaction.execute(client);

	//Get the receipt of the scheduled transaction
	const receipt = await txResponse.getReceipt(client);

	//Get the schedule ID
	const scheduleId = receipt.scheduleId;

	return scheduleId;
};

const accountBalance = async (accountID) => {
	const client = await getClient();
	//Check the account's balance
	const getBalance = await new AccountBalanceQuery()
		.setAccountId(accountID)
		.execute(client);

	console.log(
		`\nBalance of ${accountID}: ` + getBalance.hbars.toTinybars() + ' tinybars.'
	);
};

const submitSignature = async (scheduleId, privateKey) => {
	console.log('\nAdding signature to scheduled Transaction ');

	const client = await getClient();
	//Submitting signatures to scheduled transaction
	const signTransaction = await new ScheduleSignTransaction()
		.setScheduleId(scheduleId)
		.freezeWith(client)
		.sign(privateKey);

	//Sign with the client operator key to pay for the transaction and submit to a Hedera network
	const txResponse = await signTransaction.execute(client);

	//Get the receipt of the transaction
	const receipt = await txResponse.getReceipt(client);

	//Get the transaction status
	const transactionStatus = receipt.status;
	console.log(
		'The sign transaction consensus status is ' + transactionStatus.toString()
	);
};

const queryScheduledTxn = async (scheduleId) => {
	const client = await getClient();
	//Create the query
	const info = await new ScheduleInfoQuery()
		.setScheduleId(scheduleId)
		.execute(client);

	//Consoling the information
	console.log('\n\n\nScheduled Transaction Info -');
	console.log('ScheduleId :', new ScheduleId(info.scheduleId).toString());
	console.log('Memo : ', info.scheduleMemo);
	console.log('Created by : ', new AccountId(info.creatorAccountId).toString());
	console.log('Payed by : ', new AccountId(info.payerAccountId).toString());
	console.log(
		'Expiration time : ',
		new Timestamp(info.expirationTime).toDate()
	);
	if (
		new Timestamp(info.executed).toDate().getTime() ===
		new Date('1970-01-01T00:00:00.000Z').getTime()
	) {
		console.log('The transaction has not been executed yet.');
	} else {
		console.log('Time of execution : ', new Timestamp(info.executed).toDate());
	}
};

main();
