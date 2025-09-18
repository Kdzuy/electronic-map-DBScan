const sheetTypes = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Types");
const sheetMarkers = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Markers");
const sheetAccounts = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Accounts");

/**
 * Hàm phụ để tạo chuỗi phiên bản (version hash) cho dữ liệu ghim.
 * Tránh lặp lại code ở nhiều nơi.
 */
function generateMarkersVersion() {
  try {
    // 1. Lấy toàn bộ dữ liệu dưới dạng một mảng hai chiều
    const dataRange = sheetMarkers.getDataRange();
    const values = dataRange.getValues();

    // 2. Chuyển toàn bộ dữ liệu thành một chuỗi JSON duy nhất.
    // Đây là cách hiệu quả để đảm bảo mọi giá trị, kể cả số và ngày tháng, đều được biểu diễn nhất quán.
    const dataString = JSON.stringify(values);

    // 3. Tính toán "dấu vân tay" MD5 từ chuỗi dữ liệu.
    // Bất kỳ thay đổi nào trong dataString cũng sẽ tạo ra một hash hoàn toàn khác.
    const hashBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, dataString);
    
    // 4. Chuyển đổi mảng byte của hash thành một chuỗi hex để dễ dàng so sánh
    const version = hashBytes.map(byte => {
      return ('0' + (byte & 0xFF).toString(16)).slice(-2);
    }).join('');

    return version;

  } catch (e) {
    // Nếu có lỗi, trả về một giá trị ngẫu nhiên để buộc client phải tải lại
    return new Date().getTime().toString();
  }
}

function doGet(e) {
  const action = e.parameter.action;

  // ACTION MỚI (NHẸ): Chỉ lấy phiên bản dữ liệu
  if (action == "getMarkersVersion") {
    const version = generateMarkersVersion();
    return ContentService.createTextOutput(JSON.stringify({ version: version }))
           .setMimeType(ContentService.MimeType.JSON);
  }
  
  // ACTION LẤY TYPES
  if (action == "getTypes") {
    const data = sheetTypes.getDataRange().getValues();
    const headers = data.shift();
    const types = data.map(row => {
        let type = {};
        headers.forEach((header, i) => type[header] = row[i]);
        return type;
    });
    return ContentService.createTextOutput(JSON.stringify(types)).setMimeType(ContentService.MimeType.JSON);
  }

  // ACTION LẤY GHIM (PHÂN ĐOẠN)
  if (action == "getMarkers") {
      const offset = parseInt(e.parameter.offset || 0);
      const limit = parseInt(e.parameter.limit || 50);
      
      const data = sheetMarkers.getDataRange().getValues();
      const headers = data.shift();
      
      const allMarkers = data.map(row => {
          let marker = {};
          headers.forEach((header, i) => marker[header] = row[i]);
          return marker;
      });

      const total = allMarkers.length;
      const chunk = allMarkers.slice(offset, offset + limit);

      return ContentService.createTextOutput(JSON.stringify({ markers: chunk, total: total }))
             .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  const requestData = JSON.parse(e.postData.contents);
  const action = requestData.action;
  
  try {
    if (action === 'validateCredentials') {
      const username = requestData.username;
      const password = requestData.password;

      const data = sheetAccounts.getDataRange().getValues();
      const headers = data.shift();
      const usernameIndex = headers.indexOf('Username');
      const passwordIndex = headers.indexOf('Password');

      for (let i = 0; i < data.length; i++) {
        if (data[i][usernameIndex] === username && data[i][passwordIndex] === password) {
          // Tìm thấy tài khoản, trả về thông tin người dùng (KHÔNG BAO GỒM MẬT KHẨU)
          let userAccount = {};
          headers.forEach((header, index) => {
            if (header !== 'Password') { // Lọc bỏ mật khẩu
              userAccount[header] = data[i][index];
            }
          });
          return ContentService.createTextOutput(JSON.stringify({ success: true, user: userAccount })).setMimeType(ContentService.MimeType.JSON);
        }
      }

      // Nếu không tìm thấy
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: 'Tên đăng nhập hoặc mật khẩu không đúng.' })).setMimeType(ContentService.MimeType.JSON);
    }
    // --- XỬ LÝ LƯU TỪNG MARKER ---
    if (action == "addMarker") {
      const marker = requestData.marker;
      const headers = sheetMarkers.getRange(1, 1, 1, sheetMarkers.getLastColumn()).getValues()[0];
      const newRow = headers.map(header => marker[header] || "");
      sheetMarkers.appendRow(newRow);
      return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Thêm ghim thành công." })).setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action == "updateMarker") {
      const marker = requestData.marker;
      const data = sheetMarkers.getDataRange().getValues();
      const headers = data.shift();
      const rowIndex = data.findIndex(row => row[0] == marker.id) + 2; // +2 vì index bắt đầu từ 0 và có header
      
      if (rowIndex > 1) {
        const newRow = headers.map(header => marker[header] || "");
        sheetMarkers.getRange(rowIndex, 1, 1, newRow.length).setValues([newRow]);
        return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Cập nhật ghim thành công." })).setMimeType(ContentService.MimeType.JSON);
      }
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Không tìm thấy ghim để cập nhật." })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action == "deleteMarker") {
      const markerId = requestData.markerId;
      const data = sheetMarkers.getDataRange().getValues();
      data.shift(); // Tách riêng header để không ảnh hưởng index
      const rowIndex = data.findIndex(row => row[0] == markerId) + 2; // Sửa thành +2
      
      if (rowIndex > 1) { 
        sheetMarkers.deleteRow(rowIndex);
        return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Xóa ghim thành công." })).setMimeType(ContentService.MimeType.JSON);
      }
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Không tìm thấy ghim để xóa." })).setMimeType(ContentService.MimeType.JSON);
    }

    // --- XỬ LÝ LƯU TOÀN BỘ TYPES (VẪN GIỮ NGUYÊN) ---
    if (action == "saveTypes") {
      const types = requestData.types;
      const headers = sheetTypes.getRange(1, 1, 1, sheetTypes.getLastColumn()).getValues()[0];
      const dataToSave = types.map(typeObj => headers.map(header => typeObj[header] || ""));
      
      sheetTypes.getRange(2, 1, sheetTypes.getLastRow() - 1 || 1, sheetTypes.getLastColumn()).clearContent();
      if (dataToSave.length > 0) {
        sheetTypes.getRange(2, 1, dataToSave.length, dataToSave[0].length).setValues(dataToSave);
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Lưu loại ghim thành công." })).setMimeType(ContentService.MimeType.JSON);
    }
      if (action == "deleteMarkersBatch") {
        const markerIdsToDelete = requestData.markerIds; // Đây là một mảng các ID
        if (!markerIdsToDelete || markerIdsToDelete.length === 0) {
          return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Không có ghim nào để xóa." })).setMimeType(ContentService.MimeType.JSON);
        }

        const data = sheetMarkers.getDataRange().getValues();
        const headers = data.shift();
        const idColumnIndex = headers.indexOf('id');

        if (idColumnIndex === -1) {
          return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Không tìm thấy cột 'id' trong trang tính Markers." })).setMimeType(ContentService.MimeType.JSON);
        }

        // Chuyển mảng ID cần xóa sang dạng Set để tra cứu nhanh hơn
        const idsToDeleteSet = new Set(markerIdsToDelete.map(String));

        // Duyệt ngược từ cuối lên đầu để tránh lỗi sai chỉ số khi xóa dòng
        for (let i = data.length - 1; i >= 0; i--) {
          const rowId = String(data[i][idColumnIndex]);
          if (idsToDeleteSet.has(rowId)) {
            // +2 vì chỉ số sheet bắt đầu từ 1 và ta đã bỏ dòng tiêu đề
            sheetMarkers.deleteRow(i + 2);
          }
        }

        return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Xóa hàng loạt ghim thành công." })).setMimeType(ContentService.MimeType.JSON);
      }
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Hành động không hợp lệ." })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: err.message })).setMimeType(ContentService.MimeType.JSON);
  }
}
function getMarkersAndVersion() {
  const data = sheetMarkers.getDataRange().getValues();
  const headers = data.shift(); // Tách dòng tiêu đề

  const markers = data.map(row => {
    let marker = {};
    headers.forEach((header, i) => marker[header] = row[i]);
    return marker;
  });

  // Tạo một chuỗi phiên bản đơn giản: số hàng + nội dung ô cuối cùng
  const lastRow = sheetMarkers.getLastRow();
  const lastCol = sheetMarkers.getLastColumn();
  let version = "v1.0-" + lastRow + "-" + lastCol;
  if (lastRow > 1 && lastCol > 0) {
    const lastCellValue = sheetMarkers.getRange(lastRow, lastCol).getValue();
    version += "-" + lastCellValue;
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    markers: markers,
    version: version 
  })).setMimeType(ContentService.MimeType.JSON);
}
function doOptions(e) {
  // Hàm này dùng để trả lời cho các yêu cầu "preflight" của trình duyệt
  return ContentService.createTextOutput()
    .withHeaders({
      'Access-Control-Allow-Origin': '*', // Cho phép mọi nguồn gốc
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', // Các phương thức được phép
      'Access-Control-Allow-Headers': 'Content-Type', // Các header được phép
    });
}