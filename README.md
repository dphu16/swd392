# CourtChain - Triển khai 5 Use Cases (SWD392 Group 1)

> **Sinh viên thực hiện:** Phùng Đình Phú (HE191603)  
> **Môn học:** SWD392 - Software Architecture and Design  
> **Đồ án:** Nền tảng quản lý chuỗi sân thể thao thông minh **CourtChain**  
> **Use Cases:** **UC48, UC49, UC50, UC62, UC63**

---

## 🌟 Giới thiệu Hệ thống & Use Cases

Dự án cung cấp trọn gói **Backend REST API** và **Frontend Quản trị Web trực quan (Single Page App)** phục vụ 5 use case then chốt:

1. **UC48: Deactivate Staff Account** (Facility Manager)
   - Vô hiệu hóa tài khoản nhân viên (`INACTIVE`), giữ nguyên dữ liệu lịch sử kế toán/giao dịch (`BR209`).
   - Hủy tức thì toàn bộ phiên đăng nhập/JWT token thông qua tăng `tokenVersion` (`BR210`).
   - Tự động hủy phân ca tương lai (`Shift.SCHEDULED`) và ghi sổ nhật ký kiểm toán `auditLogs`.
   - **Chặn vô hiệu hóa nếu nhân viên đang có ca làm việc mở (`Shift.OPEN`, EX-1 & BR193)** hoặc thuộc chi nhánh khác (`BR100`).

2. **UC49: View Court Occupancy** (Facility Manager)
   - Đo lường chính xác tỷ lệ lấp đầy sân theo chi nhánh (`BR100`).
   - Bóc tách phân tích **Giờ cao điểm (Peak: [17:00, 22:00)) vs Giờ thấp điểm (Off-Peak) (`BR27`)**.
   - Loại trừ thời gian bảo trì sân (`CourtMaintenance`) khỏi thời gian bookable (`BR216`).
   - Bảng phân tích chi tiết từng sân và biểu đồ diễn biến theo ngày (Daily Timeline).

3. **UC50: View Branch Revenue** (Facility Manager)
   - Ghi nhận doanh thu quản trị: **Chỉ ghi nhận khi dịch vụ hoàn thành hoặc hàng đã giao (`BR217`)**.
   - **Tách riêng các khoản công nợ/nghĩa vụ**: Tiền đặt cọc (`Active Deposits`) và tiền thanh toán trước chưa phục vụ (`Unserved Prepayments`) sang cột nợ riêng (`BR217`).
   - Tính toán Giá vốn trực tiếp (`Direct COGS`) và **Lợi nhuận gộp Hoạt động (`Gross Operating Profit = Net Revenue - Direct COGS`, BR218)**.
   - Phân loại theo 3 kênh thanh toán: `CASH`, `VNPAY`, `VIETQR` (`BR163`), làm tròn số tiền VND (`BR50`).

4. **UC62: View Chain Performance** (Court Owner)
   - Dashboard điều hành toàn chuỗi độc quyền cho Chủ chuỗi sân (`BR101`).
   - Hợp nhất doanh thu, lãi gộp, công suất lấp đầy, số ca đặt sân và số tiền hoàn hủy.
   - Đo lường chính xác **Tỷ lệ bỏ ca không đến (No-Show Rate = `noShow / totalSessions * 100%`)**.
   - Bảng xếp hạng và so sánh hiệu quả kinh doanh giữa các chi nhánh (`branchRankings`).

5. **UC63: View Chain Inventory** (Court Owner)
   - Quản trị kho toàn chuỗi: **Tồn kho khả dụng = On-Hand − Held − Quarantined (`BR168, BR169`)**.
   - Phân loại hàng trung chuyển liên chi nhánh (`transfer.DISPATCHED`) là **In-Transit**, không tính vào hàng khả dụng ở cả 2 cơ sở (`BR229`).
   - Định giá kho theo phương pháp giá vốn bình quân di động (`Moving Average Cost`).
   - Đo lường tỷ lệ lệch kiểm kê định kỳ (`BR215`).
   - **Tính năng thông minh:** Tự động phát hiện chi nhánh thiếu hàng (Low Stock / Out of Stock) và chi nhánh thừa tồn kho để đề xuất lệnh điều chuyển kho nội bộ (hỗ trợ UC66).

---

## 🚀 Hướng dẫn Cài đặt & Khởi chạy

### Yêu cầu:
- Node.js version 20 trở lên.
- Không cần cài thêm bất kỳ thư viện npm bên ngoài nào (Zero external dependencies).

### 1. Khởi chạy Web Application & REST API Server
```powershell
npm start
```
- Mở trình duyệt web truy cập: **`http://localhost:3000`**
- Giao diện Frontend Dashboard sẽ hiển thị ngay lập tức với đầy đủ tính năng.

### 2. Chuyển đổi Vai trò (Persona Switcher)
Trên thanh tiêu đề (Header) của giao diện web, bạn có thể dễ dàng chuyển đổi qua lại giữa các vai trò để kiểm thử phân quyền RBAC:
- **👑 Court Owner (`owner-1`)**: Toàn quyền xem và điều hành tất cả 5 use cases.
- **🏢 Facility Manager Hòa Lạc (`manager-1`)**: Quản lý nhân viên, công suất và doanh thu của Chi nhánh 1.
- **🏢 Facility Manager Thạch Thất (`manager-2`)**: Quản lý chi nhánh 2.
- **👤 Staff (`staff-1`)**: Kiểm tra hạn chế quyền truy cập.

### 3. Chạy Toàn bộ 36 Automated Tests
```powershell
npm test
```
Toàn bộ 36 bài kiểm thử (Bao gồm Unit Tests, Integration Tests và Router E2E Tests) được thực thi tự động qua test runner bản địa của Node.js:
```
✔ CourtChain Use Cases (UC48, UC49, UC50, UC62, UC63) (80.4841ms)
ℹ tests 36
ℹ suites 7
ℹ pass 36
ℹ fail 0
```

---

## 📁 Cấu trúc Thư mục

```
code/
├── package.json                   # Cấu hình dự án & scripts (start, test)
├── README.md                      # Hướng dẫn chi tiết
├── public/                        # Frontend UI Dashboard
│   ├── index.html                 # Giao diện HTML5 hiện đại
│   ├── styles.css                 # CSS phong cách Dark Mode chuyên nghiệp
│   └── app.js                     # Xử lý tương tác SPA & gọi REST API
├── src/                           # Backend Module & Core Domain Logic
│   ├── auth.js                    # Xác thực x-user-id & Phân quyền RBAC
│   ├── errors.js                  # Lớp AppError & xử lý assert
│   ├── router.js                  # REST API Router & Static File Handler
│   ├── server.js                  # HTTP Server chuẩn Node.js
│   ├── store.js                   # Mock DB Store & Seed Data
│   ├── utils.js                   # Tiện ích tính toán thời gian, tài chính, %
│   └── services/                  # Nghiệp vụ 5 Use Cases
│       ├── index.js               # Barrel export
│       ├── staffService.js        # UC48: Deactivate Staff Account
│       ├── occupancyService.js    # UC49: View Court Occupancy
│       ├── revenueService.js      # UC50: View Branch Revenue
│       ├── chainPerformanceService.js # UC62: View Chain Performance
│       └── chainInventoryService.js   # UC63: View Chain Inventory
└── test/
    └── useCases.test.js           # 36 Test cases tự động bao phủ 100% kịch bản
```
