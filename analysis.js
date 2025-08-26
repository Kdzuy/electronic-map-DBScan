// analysis.js

// --- CẤU HÌNH PHÂN TÍCH ---
// Bán kính để tìm các điểm lân cận (tính bằng km)
const DBSCAN_EPSILON = 1;
// Số điểm tối thiểu để tạo thành một cụm
const DBSCAN_MIN_POINTS = 3;
// Ngưỡng để phân biệt mật độ cao và thấp (số điểm trên mỗi km vuông)
const DENSITY_THRESHOLD = 15;

/**
 * Sử dụng DBSCAN để phân tích và trực quan hóa các cụm ghim.
 * Phân loại cụm dựa trên mật độ và loại ghim (mật độ cao, tương quan, đơn lẻ).
 */
function runDBScanAnalysis(visibleMarkers) {
    // --- NÂNG CẤP AN TOÀN ---
    // Nếu hàm không nhận được dữ liệu, nó sẽ tự lấy từ bản đồ để tránh lỗi.
    if (!visibleMarkers) {
        console.warn("runDBScanAnalysis không nhận được dữ liệu, đang tự lấy từ map layer.");
        const filteredLayers = markerLayerGroup.getLayers();
        visibleMarkers = filteredLayers.map(layer => layer.markerData);
    }
    // --- KẾT THÚC NÂNG CẤP ---

    // Dọn dẹp bản đồ trước khi phân tích mới
    if (interactionLayerGroup) {
        map.removeLayer(interactionLayerGroup);
    }
    markerLayerGroup.clearLayers();
    interactionLayerGroup = L.layerGroup().addTo(map);

    if (!isAnalysisMode) {
        return;
    }
    
    // Nếu không đủ điểm để phân tích, chỉ hiển thị chúng là các điểm đơn lẻ
    if (visibleMarkers.length < DBSCAN_MIN_POINTS) {
        visibleMarkers.forEach(marker => drawSolitaryMarker(marker));
        return;
    }

    const dbscan = new DBSCAN();
    // Hàm tính khoảng cách Haversine (chính xác hơn)
    const haversineDistance = (a, b) => {
        const R = 6371; // Bán kính Trái Đất (km)
        const dLat = (b[0] - a[0]) * Math.PI / 180;
        const dLon = (b[1] - a[1]) * Math.PI / 180;
        const lat1 = a[0] * Math.PI / 180;
        const lat2 = b[0] * Math.PI / 180;
        const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
        const y = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
        return R * y;
    };
    
    const coords = visibleMarkers.map(d => [d.lat, d.lng]);
    const clusters = dbscan.run(coords, DBSCAN_EPSILON, DBSCAN_MIN_POINTS, haversineDistance);

    // Tập hợp các chỉ số của tất cả các điểm đã được nhóm vào cụm
    const allClusteredIndices = new Set([].concat(...clusters));

    // 1. Vẽ các cụm tìm thấy
    clusters.forEach(clusterIndices => {
        const members = clusterIndices.map(i => visibleMarkers[i]);
        drawCluster(members);
    });

    // 2. Vẽ các điểm đơn lẻ (những điểm không thuộc cụm nào)
    visibleMarkers.forEach((marker, index) => {
        if (!allClusteredIndices.has(index)) {
            drawSolitaryMarker(marker);
        }
    });
}

/**
 * Vẽ một cụm lên bản đồ, tự động xác định màu sắc dựa trên mật độ và loại.
 * @param {Array} members Mảng các ghim trong cụm.
 */
function drawCluster(members) {
    const uniqueTypes = new Set(members.map(m => m.type));
    const hasCorrelation = uniqueTypes.size > 1;

    let mainColor, mainPopupText;

    // Tính toán mật độ của cụm để phân loại
    const allLatlngs = members.map(m => [m.lat, m.lng]);
    const bounds = L.latLngBounds(allLatlngs);
    const center = bounds.getCenter();
    const radius = center.distanceTo(bounds.getNorthWest());
    
    // Diện tích (km²), thêm một giá trị nhỏ để tránh chia cho 0
    const areaInKm2 = radius > 0 ? Math.PI * (radius / 1000) ** 2 : 0.001;
    const density = members.length / areaInKm2;

    // LOGIC PHÂN LOẠI MỚI
    // Ưu tiên 1: Kiểm tra Vùng Tương Quan (nhiều loại ghim)
    if (hasCorrelation) {
        mainColor = '#9b59b6'; // Màu tím cho tương quan
        const typeNames = Array.from(uniqueTypes).map(t => markerTypes[t]?.name || 'Không rõ').join(', ');
        mainPopupText = `Vùng Tương Quan: ${typeNames} (${members.length} điểm)`;
    } 
    // Ưu tiên 2: Phân loại theo mật độ
    else {
        const typeName = markerTypes[members[0].type]?.name || 'Không rõ';
        // Chỉ những cụm có mật độ cao mới được coi là vùng tập trung
        if (density >= DENSITY_THRESHOLD) {
            mainColor = '#e74c3c'; // Màu đỏ cho mật độ cao
            mainPopupText = `Vùng Tập Trung (Mật độ cao): ${typeName} (${members.length} điểm)`;
        } else {
            mainColor = '#f39c12'; // Màu cam cho mật độ thấp
            mainPopupText = `Cụm (Mật độ thấp): ${typeName} (${members.length} điểm)`;
        }
    }

    // Vẽ vòng tròn lớn bao quanh cụm
    L.circle(center, {
        radius: radius,
        color: mainColor,
        fillColor: mainColor,
        weight: 2,
        fillOpacity: 0.15
    }).addTo(interactionLayerGroup).bindPopup(mainPopupText);

    // Vẽ các điểm nhỏ cho từng ghim trong cụm
    members.forEach(m => {
        L.circleMarker([m.lat, m.lng], {
            radius: 5,
            color: 'white', weight: 1,
            fillColor: mainColor, fillOpacity: 0.8
        }).addTo(interactionLayerGroup).bindPopup(`<b>${m.name}</b><br>Loại: ${markerTypes[m.type]?.name}`);
    });
}

/**
 * Vẽ một điểm đơn lẻ (không thuộc cụm nào) lên bản đồ.
 * @param {Object} marker Đối tượng ghim đơn lẻ.
 */
function drawSolitaryMarker(marker) {
    L.circleMarker([marker.lat, marker.lng], {
        radius: 5,
        color: 'white', weight: 1,
        fillColor: '#7f8c8d', // Màu xám cho điểm đơn lẻ
        fillOpacity: 0.7
    }).addTo(interactionLayerGroup).bindPopup(`<b>${marker.name}</b><br>Loại: ${markerTypes[marker.type]?.name} (Đơn lẻ)`);
}