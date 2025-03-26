const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ Kết nối MongoDB (bạn cần cài MongoDB hoặc dùng MongoDB Atlas)
mongoose.connect('mongodb+srv://esp32user:Thanh94%40@esp32-gas-server.bjisc.mongodb.net/gasdata?retryWrites=true&w=majority');
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

// ✅ Khởi động server
const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
