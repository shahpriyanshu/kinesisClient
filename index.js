const express = require('express')
const Kinesis = require('aws-sdk/clients/kinesis');
const bodyParser = require('body-parser');
const app = express();
const port = 3000

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const kinesis = new Kinesis({ apiVersion: '2013-12-02', region: "ap-south-1" });

//Some stream realted constant
// SHARD_COUNT can't be constant.it depends on how many shards have been assigned to the particular stream. 
const SHARD_COUNT = 5;
const StreamName = "probeRequestDEV";
const recordLimit = 500;
const delimiter = '|';

app.get('/getStream', (req, res) => {
	kinesis.describeStream({ StreamName: 'probeRequestDEV' }, (err, data) => {
		if (err) {
			res.send(err);
		} else {
			res.send(data);
		}
	});
});
/**

app.get('/getStream', (req, res) => {
        kinesis.describeStream({ StreamName: 'stream_1547490600000' }, (err, data) => {
                if (err) {
                        res.send(err);
                } else {
                        res.send(data);
                }
        });
});
**/

app.post('/putRecords', (req, res) => {
	// const StreamName = "stream_" + new Date().setHours(0, 0, 0, 0);
	// Check if this stream is Active if not create a new Stream.
	kinesis.describeStream({ StreamName: StreamName }, (err, data) => {
		// everything goes well here, just check for active status and push records
		if (data && data.StreamDescription.StreamStatus === 'ACTIVE') {
			// PUT RECORDs in stream
			// if (req.body > 500) {
			//     res.status(413).send({ message: 'allowed data length is 500 per second'});
			// } else {
			const dataArray = data.toString().split(delimiter);
			const batchLength = Math.ceil(dataArray.length / recordLimit);
			for (let i = 0; i < batchLength; i++) {
				setTimeout(function () {
					const structureData = getStructureData(dataArray, i);
					console.log('structureData:', structureData);
					const putRecords_PARAM = {
						Records: structureData,
						StreamName
					}
					kinesis.putRecords(putRecords_PARAM, (err, data) => {
						console.log('after putting records', data);
						if (err) {
							res.status(400).send({ message: `error while inserting data in kinesis data stream: ${err}` });
						}
						else res.status(200).send({ message: `data has successfully inserted in  kinesis data stream: ${data}` })
					})
				}, 1000);
			}
		}
		if (err && err.statusCode === 400 && err.code === "ResourceNotFoundException") {
			// create new Stream with given name
			kinesis.createStream({
				StreamName: StreamName,
				ShardCount: SHARD_COUNT
			}, (err, data) => {
				if (err) res.status(400).send({ message: `Error while creating new stream. ${err} ${err.stack}` })
				else {
					// TODO:  need to hold new post request before stream status gets Active
					kinesis.describeStream({ StreamName }, (err, data) => {
						if (err) res.status(400).send('message: Error while checking stream status' + err);
						else if (data.streamStatus === 'ACTIVE') {
							// PUT RECORDs in stream
							// if (req.body.data.length > 500) {
							//     res.status(413).send({ message: 'allowed data length is 500 per second'});
							// } else {
							const structureData = getStructureData(req.body, StreamName);
							const putRecords_PARAM = {
								Records: structureData,
								StreamName
							}
							console.log('structureData:', putRecords_PARAM);
							kinesis.putRecords(putRecords_PARAM, (err, data) => {
								console.log('after putting records', data);
								if (err) res.status(400).send({ message: `error while inserting data in kinesis data stream: ${err}` });
								else res.status(200).send({ message: `data has successfully inserted in  kinesis data stream: ${data}` })
							})
							//}
						}
					})
				}
			})
		} else if (err && err.statusCode !== 400) {
			res.staus(500).send({ message: `error while processing record. ${err}` });
		}
	})
});

function getStructureData(data, index) {
	let sturcturedData = [];
	let shardIndex = 1;
	const lastRange = data.length < recordLimit * (index + 1) ? data.length : recordLimit * (index + 1); 
	for (let j = recordLimit * index; j < lastRange; j++) {
		console.log('data in loop', data[j].toString());
		sturcturedData.push({
			Data: data[j],
			PartitionKey: `SHARD_${shardIndex}`
		})
		if (shardIndex < SHARD_COUNT) {
			shardIndex++;
		} else {
			shardIndex = 0;
		}
	}
	return sturcturedData;
}

app.listen(port, () => console.log(`Example app listening on port ${port}!`))
