const sheetTypes = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Types");
const sheetMarkers = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Markers");
const sheetAccounts = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Accounts");

function doGet(e) {
  const action = e.parameter.action;
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
  if (action == "getMarkers") {
      // Nhận vai trò và tên người dùng từ yêu cầu
      const role = e.parameter.role;
      const username = e.parameter.username;

      const data = sheetMarkers.getDataRange().getValues();
      const headers = data.shift();

      // Tìm vị trí cột "Owner" để lọc
      const ownerColumnIndex = headers.indexOf('Owner');

      let markers = data.map(row => { 
          let marker = {}; 
          headers.forEach((header, i) => marker[header] = row[i]); 
          return marker; 
      }); 

      // LỌC DỮ LIỆU DỰA TRÊN VAI TRÒ
      // Nếu là Editor, chỉ giữ lại các ghim do chính họ tạo
      if (role === 'Editor') {
          markers = markers.filter(marker => marker.Owner === username || marker.Owner === "viewer");
      } 
      if (role === 'Viewer') {
          markers = markers.filter(marker => marker.Owner === "viewer");
      }
      // Nếu là Admin, không cần lọc, sẽ thấy tất cả
      // Viewer sẽ bị chặn ngay từ đầu, không nhận được dữ liệu

      return ContentService.createTextOutput(JSON.stringify(markers)).setMimeType(ContentService.MimeType.JSON); 
  }
  
  if (action == "getAccounts") {
    const data = sheetAccounts.getDataRange().getValues();
    const headers = data.shift();
    const accounts = data.map(row => {
      let account = {};
      headers.forEach((header, i) => account[header] = row[i]);
      return account;
    });
    return ContentService.createTextOutput(JSON.stringify(accounts)).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput("Invalid action").setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  const requestData = JSON.parse(e.postData.contents);
  const action = requestData.action;
  
  try {
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

function doOptions(e) {
  // Hàm này dùng để trả lời cho các yêu cầu "preflight" của trình duyệt
  return ContentService.createTextOutput()
    .withHeaders({
      'Access-Control-Allow-Origin': '*', // Cho phép mọi nguồn gốc
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', // Các phương thức được phép
      'Access-Control-Allow-Headers': 'Content-Type', // Các header được phép
    });
}