const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ Kết nối MongoDB (bạn cần cài MongoDB hoặc dùng MongoDB Atlas)
mongoose.connect(process.env.MONGODB_URI);

const GasSchema = new mongoose.Schema({
  gas: Number,
  distance: Number,
  connectionCount: { type: Number, default: 0 },
  timestamp: { type: Date, default: Date.now }
});
const GasData = mongoose.model('GasData', GasSchema);

const StatusSchema = new mongoose.Schema({
  isConnected: Boolean,
  connectionCount: Number,
  updatedAt: { type: Date, default: Date.now }
});
const Esp32Status = mongoose.model('Esp32Status', StatusSchema);

// ✅ API: ESP32 gửi dữ liệu
app.post('/api/gas', async (req, res) => {
  const { gas, distance, connectionCount } = req.body;
  try {
    const newData = new GasData({ gas, distance, connectionCount });
    await newData.save();
    res.status(200).json({ message: 'Saved' });
  } catch (err) {
    res.status(500).json({ error: 'Save failed' });
  }
});

// ✅ API: App Android lấy tất cả lịch sử
app.get('/api/gas', async (req, res) => {
  const data = await GasData.find().sort({ timestamp: -1 });
  res.json(data);
});

// ✅ API: Lọc dữ liệu theo thời gian
app.get('/api/gas/range', async (req, res) => {
  const { from, to } = req.query;
  const data = await GasData.find({
    timestamp: { $gte: new Date(from), $lte: new Date(to) }
  }).sort({ timestamp: -1 });
  res.json(data);
});

// ✅ API điều khiển thiết bị (bật/tắt còi)
app.post('/api/control', (req, res) => {
  const { action } = req.body;
  if (action === 'ON') {
    console.log('Bật thiết bị');
    res.status(200).json({ message: 'Device turned ON' });
  } else if (action === 'OFF') {
    console.log('Tắt thiết bị');
    res.status(200).json({ message: 'Device turned OFF' });
  } else {
    res.status(400).json({ error: 'Invalid action' });
  }
});

a// ✅ API kiểm tra kết nối ESP32 (chỉ tăng khi chuyển từ ngắt → kết nối)
app.post('/api/esp32/connect', async (req, res) => {
  let status = await Esp32Status.findOne();
  if (!status) {
    status = new Esp32Status({ isConnected: true, connectionCount: 1 });
  } else {
    if (!status.isConnected) {
      // Chỉ tăng khi trước đó là DISCONNECTED
      status.connectionCount += 1;
    }
    status.isConnected = true;
  }
  status.updatedAt = new Date();
  await status.save();
  res.status(200).json({ message: 'ESP32 connected' });
});


// ✅ API để tắt kết nối ESP32 (khi ESP32 ngắt kết nối)
app.post('/api/esp32/disconnect', async (req, res) => {
  let status = await Esp32Status.findOne();
  if (!status) {
    status = new Esp32Status({ isConnected: false, connectionCount: 0 });
  } else {
    status.isConnected = false;
  }
  status.updatedAt = new Date();
  await status.save();
  res.status(200).json({ message: 'ESP32 disconnected' });
});

// ✅ API kiểm tra trạng thái kết nối ESP32
app.get('/api/esp32/status', async (req, res) => {
  const status = await Esp32Status.findOne();
  if (!status) {
    return res.json({ status: 'disconnected', connectionCount: 0 });
  }
  res.json({
    status: status.isConnected ? 'connected' : 'disconnected',
    connectionCount: status.connectionCount
  });
});

// ✅ API: Lấy bản ghi mới nhất (1 record gần nhất)
app.get('/api/gas/latest', async (req, res) => {
  try {
    const latest = await GasData.findOne().sort({ timestamp: -1 });
    res.json(latest);
  } catch (err) {
    res.status(500).json({ error: 'Không thể lấy dữ liệu mới nhất' });
  }
});

// ✅ Khởi động server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));