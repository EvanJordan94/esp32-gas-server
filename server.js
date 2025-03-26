const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ Kết nối MongoDB (bạn cần cài MongoDB hoặc dùng MongoDB Atlas)
mongoose.connect(process.env.MONGODB_URI, {});
// ✅ Tạo cấu trúc dữ liệu
const GasSchema = new mongoose.Schema({
  gas: Number,
  distance: Number,
  timestamp: { type: Date, default: Date.now }
});
const GasData = mongoose.model('GasData', GasSchema);

// ✅ API: ESP32 gửi dữ liệu
app.post('/api/gas', async (req, res) => {
  const { gas, distance } = req.body;
  try {
    const newData = new GasData({ gas, distance });
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
  const { action } = req.body;  // action có thể là 'ON' hoặc 'OFF'
  
  // Kiểm tra hành động và xử lý điều khiển thiết bị
  if (action === 'ON') {
    console.log('Bật thiết bị');  // Gửi tín hiệu bật thiết bị (còi, servo, v.v.)
    // Ở đây bạn có thể gửi lệnh tới ESP32 qua WebSocket, Bluetooth hoặc giao thức khác nếu cần
    res.status(200).json({ message: 'Device turned ON' });
  } else if (action === 'OFF') {
    console.log('Tắt thiết bị');  // Gửi tín hiệu tắt thiết bị (còi, servo, v.v.)
    // Xử lý tắt thiết bị tại đây
    res.status(200).json({ message: 'Device turned OFF' });
  } else {
    res.status(400).json({ error: 'Invalid action' });
  }
});

// ✅ Khởi động server
const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
