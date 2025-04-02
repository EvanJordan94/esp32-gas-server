const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const moment = require('moment-timezone'); 
const app = express();
app.use(cors());
app.use(bodyParser.json());

/// ✅ Kết nối MongoDB
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

let buzzerState = 'OFF'; // Lưu trạng thái còi

// ✅ API: ESP32 gửi dữ liệu
app.post('/api/gas', async (req, res) => {
  const { gas, distance, connectionCount } = req.body;
  console.log("Dữ liệu nhận được từ ESP32:", req.body);  // In dữ liệu nhận từ ESP32
  try {
    const newData = new GasData({ gas, distance, connectionCount });
    await newData.save();
    res.status(200).json({ message: 'Saved' });
  } catch (err) {
    console.error("Lỗi lưu dữ liệu:", err);
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
  const fromDate = moment.tz(from, "Asia/Ho_Chi_Minh").toDate();
  const toDate = moment.tz(to, "Asia/Ho_Chi_Minh").toDate();

  try {
      const filteredData = await GasData.find({
          timestamp: { $gte: fromDate, $lte: toDate }
      }).sort({ timestamp: 1 });

      res.json(filteredData);
  } catch (err) {
      console.error("Lỗi khi lọc dữ liệu:", err);
      res.status(500).json({ error: 'Lỗi khi lọc dữ liệu' });
  }
});
let manualBuzzerState = 'OFF'; // Trạng thái còi thủ công
let autoBuzzerState = 'OFF'; // Trạng thái còi tự động
// API điều khiển còi thủ công
app.post('/api/buzzer/manual', (req, res) => {
  const { action } = req.body;
  manualBuzzerState = action;
  sendBuzzerCommandToEsp32(action, res);
});

// API điều khiển còi tự động
app.post('/api/buzzer/auto', (req, res) => {
  const { action } = req.body;
  autoBuzzerState = action;
  sendBuzzerCommandToEsp32(action, res);
});

// Hàm gửi lệnh đến ESP32
function sendBuzzerCommandToEsp32(action, res) {
  const esp32Url = 'http://192.168.75.174/api/buzzer'; // Thay đổi IP
  fetch(esp32Url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
  })
  .then(response => response.json())
  .then(data => res.json({ message: 'Lệnh đã được gửi', status: data.status }))
  .catch(error => {
      console.error('Lỗi:', error);
      res.status(500).json({ message: 'Lỗi gửi lệnh đến ESP32' });
  });
}
// API nhận trạng thái còi từ ESP32
app.post('/api/buzzer/status', (req, res) => {
  const { status } = req.body;
  // Lưu trạng thái còi vào database (nếu cần)
  buzzerState = status;
  res.json({ message: 'Trạng thái còi đã được cập nhật' });
});

// API lấy trạng thái còi hiện tại
app.get('/api/control/status', (req, res) => {
  res.json({ manual: manualBuzzerState, auto: autoBuzzerState });
});

// ✅ API kiểm tra trạng thái kết nối ESP32
app.get('/api/esp32/status', async (req, res) => {
  try {
    const status = await Esp32Status.findOne();
    console.log("Trạng thái kết nối ESP32:", status);  // In trạng thái kết nối của ESP32

    if (!status) {
      // Nếu không có bản ghi nào, giả định rằng ESP32 đang ngắt kết nối
      return res.json({ status: 'disconnected', connectionCount: 0 });
    }

    res.json({
      status: status.isConnected ? 'connected' : 'disconnected',
      connectionCount: status.connectionCount
    });
  } catch (err) {
    console.error("Lỗi khi lấy trạng thái kết nối ESP32:", err);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

/// API ESP32 kết nối lại (Khi app bật switch)
app.post('/api/esp32/connect', async (req, res) => {
  try {
      let status = await Esp32Status.findOne();
      if (!status) {
          status = new Esp32Status({ isConnected: true, connectionCount: 1 });
      } else {
          if (!status.isConnected) {
              status.connectionCount += 1;
              status.isConnected = true;
          } else {
              return res.status(200).json({ message: 'ESP32 already connected' });
          }
      }
      status.updatedAt = new Date();
      await status.save();
      console.log(`ESP32 Connected: connectionCount ${status.connectionCount}`);
      res.status(200).json({ message: 'ESP32 connected' });
  } catch (err) {
      console.error("Error while connecting ESP32:", err);
      res.status(500).json({ error: 'Failed to connect ESP32' });
  }
});

// API ESP32 ngắt kết nối (Khi app tắt switch)
app.post('/api/esp32/disconnect', async (req, res) => {
  try {
      let status = await Esp32Status.findOne();
      if (!status) {
          status = new Esp32Status({ isConnected: false, connectionCount: 0 });
      } else {
          if (status.isConnected) {
              status.isConnected = false;
              status.updatedAt = new Date();
              await status.save();
              console.log(`ESP32 Disconnected: connectionCount ${status.connectionCount}`);
              return res.status(200).json({ message: 'ESP32 disconnected' });
          } else {
              return res.status(200).json({ message: 'ESP32 already disconnected' });
          }
      }
      res.status(200).json({ message: 'ESP32 disconnected' });
  } catch (err) {
      console.error("Error while disconnecting ESP32:", err);
      res.status(500).json({ error: 'Failed to disconnect ESP32' });
  }
});

// ✅ API: Lấy bản ghi mới nhất (1 record gần nhất)
app.get('/api/gas/latest', async (req, res) => {
  try {
    const latest = await GasData.findOne().sort({ timestamp: -1 });
    console.log("Dữ liệu mới nhất từ database:", latest);  // In dữ liệu mới nhất
    res.json(latest);
  } catch (err) {
    console.error("Lỗi lấy dữ liệu mới nhất:", err);
    res.status(500).json({ error: 'Không thể lấy dữ liệu mới nhất' });
  }
});
const ThresholdSchema = new mongoose.Schema({
  threshold: Number,
  updatedAt: { type: Date, default: Date.now }
});
const Threshold = mongoose.model('Threshold', ThresholdSchema);
app.post('/api/threshold', async (req, res) => {
  const { threshold } = req.body;
  try {
      let currentThreshold = await Threshold.findOne();
      if (!currentThreshold) {
          currentThreshold = new Threshold({ threshold });
      } else {
          currentThreshold.threshold = threshold;
          currentThreshold.updatedAt = new Date();
      }
      await currentThreshold.save();
      res.json({ message: 'Threshold updated' });
  } catch (err) {
      console.error("Error updating threshold:", err);
      res.status(500).json({ error: 'Failed to update threshold' });
  }
});
app.get('/api/threshold', async (req, res) => {
  try {
      const currentThreshold = await Threshold.findOne();
      if (currentThreshold) {
          res.json({ threshold: currentThreshold.threshold });
      } else {
          res.json({ threshold: 1000 }); // Giá trị mặc định nếu không có ngưỡng
      }
  } catch (err) {
      console.error("Error getting threshold:", err);
      res.status(500).json({ error: 'Failed to get threshold' });
  }
});

// ✅ Khởi động server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));

