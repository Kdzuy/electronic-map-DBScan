// analysis.js

// --- CẤU HÌNH PHÂN TÍCH ---
// Bán kính để tìm các điểm lân cận (tính bằng km)
const DBSCAN_EPSILON = 1;
// Số điểm tối thiểu để tạo thành một cụm
const DBSCAN_MIN_POINTS = 3;
// Ngưỡng để phân biệt mật độ cao và thấp (số điểm trên mỗi km vuông)
// const DENSITY_THRESHOLD = 15;

/**
 * Sử dụng DBSCAN để phân tích và trực quan hóa các cụm ghim.
 * Phân loại cụm dựa trên mật độ và loại ghim (mật độ cao, tương quan, đơn lẻ).
 */
function runDBScanAnalysis(visibleMarkers) {
    // --- NÂNG CẤP AN TOÀN ---
    if (!visibleMarkers) {
        // console.log("runDBScanAnalysis không nhận được dữ liệu, đang tự lấy từ map layer.");
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
    
    clearAnalysisResults(); // Xóa kết quả phân tích cũ trước khi chạy

    if (visibleMarkers.length < DBSCAN_MIN_POINTS) {
        visibleMarkers.forEach(marker => drawSolitaryMarker(marker));
        return;
    }

    const dbscan = new DBSCAN();
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
    
    // Chạy phân cụm lần 1: Trên tất cả các điểm để tìm các cụm hỗn hợp (tương quan)
    const coords = visibleMarkers.map(d => [d.lat, d.lng]);
    let clusters = dbscan.run(coords, DBSCAN_EPSILON, DBSCAN_MIN_POINTS, haversineDistance);

    // Chuẩn bị cho lần 2: Phân nhóm các ghim theo từng loại riêng biệt
    const markersByType = visibleMarkers.reduce((acc, marker, index) => {
        (acc[marker.type] = acc[marker.type] || []).push({ marker: marker, originalIndex: index });
        return acc;
    }, {});

    if (Object.keys(markersByType).length > 1) {
        // Chạy phân cụm lần 2: Lặp qua từng loại ghim và chạy DBSCAN riêng
        for (const typeKey in markersByType) {
            const typeGroup = markersByType[typeKey];
            if (typeGroup.length < DBSCAN_MIN_POINTS) continue;

            const typeCoords = typeGroup.map(item => [item.marker.lat, item.marker.lng]);
            const typeClusters = dbscan.run(typeCoords, DBSCAN_EPSILON, DBSCAN_MIN_POINTS, haversineDistance);

            const mappedTypeClusters = typeClusters.map(localCluster =>
                localCluster.map(localIndex => typeGroup[localIndex].originalIndex)
            );

            clusters.push(...mappedTypeClusters);
        }
    }

    // --- START SỬA LỖI: Lọc bỏ các cụm bị trùng lặp ---
    const uniqueClusters = new Map();
    clusters.forEach(clusterIndices => {
        // Sắp xếp các chỉ số để tạo ra một key nhất quán (ví dụ: [5, 0, 8] và [0, 5, 8] sẽ như nhau)
        const sortedIndices = [...clusterIndices].sort((a, b) => a - b);
        const key = sortedIndices.join(','); // Key sẽ là chuỗi '0,5,8'

        // Nếu key chưa tồn tại, thêm cụm này vào Map.
        if (!uniqueClusters.has(key)) {
            uniqueClusters.set(key, clusterIndices);
        }
    });
    // Gán lại biến clusters bằng danh sách các cụm đã được lọc duy nhất
    clusters = Array.from(uniqueClusters.values());
    // --- END SỬA LỖI ---

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

    populateAnalysisLists(); // Hiển thị kết quả ra danh sách
}
/**
 * Vẽ một cụm lên bản đồ, tự động xác định màu sắc dựa trên mật độ và loại.
 * @param {Array} members Mảng các ghim trong cụm.
 */
function drawCluster(members) {
    const uniqueTypes = new Set(members.map(m => m.type));
    const hasCorrelation = uniqueTypes.size > 1;

    let mainColor, mainPopupText, clusterName, iconHtml;

    const allLatlngs = members.map(m => [m.lat, m.lng]);
    const bounds = L.latLngBounds(allLatlngs);
    const center = bounds.getCenter();
    const radius = center.distanceTo(bounds.getNorthWest());

    if (hasCorrelation) { 
        mainColor = '#f39c12'; // Vàng cho tương quan
        const typeNames = Array.from(uniqueTypes).map(t => markerTypes[t]?.name || 'Không rõ').join(', ');
        clusterName = typeNames;
        mainPopupText = `<b>Vùng Tương Quan: </b>${clusterName} (<b>${members.length}</b> điểm)`;
        // Sử dụng icon mắt xích cho vùng tương quan
        iconHtml = `<span class="analysis-list-icon fa-icon-span"><i class="fa-solid fa-link"></i></span>`;
        correlatedClusters.push({ center, name: clusterName, count: members.length, iconHtml });
    } 
    else {
        const typeKey = members[0].type;
        const typeName = markerTypes[typeKey]?.name || 'Không rõ';
        // Lấy URL icon từ đối tượng markerTypes
        const iconUrl = markerTypes[typeKey]?.icon.options.iconUrl;
        clusterName = typeName;
        mainColor = '#e74c3c'; // Đỏ cho mật độ cao
        mainPopupText = `<b>Vùng Tập Trung (Mật độ cao): </b>${clusterName} (<b>${members.length}</b> điểm)`;
        // Sử dụng thẻ img cho icon của loại địa điểm
        iconHtml = iconUrl ? `<img src="${iconUrl}" class="analysis-list-icon">` : '';
        highDensityClusters.push({ center, name: clusterName, count: members.length, iconHtml });
    }

    L.circle(center, {
        radius: radius, color: mainColor, fillColor: mainColor,
        weight: 2, fillOpacity: 0.15
    }).addTo(interactionLayerGroup).bindPopup(mainPopupText);

    members.forEach(m => {
        L.circleMarker([m.lat, m.lng], {
            radius: 5, color: 'white', weight: 1,
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
        fillColor: '#2980b9', // Màu xanh đậm cho điểm đơn lẻ
        fillOpacity: 0.7
    }).addTo(interactionLayerGroup).bindPopup(`<b>${marker.name}</b><br>Loại: ${markerTypes[marker.type]?.name} (Đơn lẻ)`);
}

/**
 * Điền dữ liệu vào các danh sách kết quả phân tích trong sidebar.
 */
function populateAnalysisLists() {
    const highDensityList = document.getElementById('high-density-list');
    const correlatedList = document.getElementById('correlated-list');

    // Sắp xếp các cụm theo số lượng điểm giảm dần (xếp hạng)
    highDensityClusters.sort((a, b) => b.count - a.count);
    correlatedClusters.sort((a, b) => b.count - a.count);

    // Tạo HTML cho danh sách Mật Độ Cao
    if (highDensityClusters.length > 0) {
        highDensityList.innerHTML = highDensityClusters.map((cluster, index) => `
            <div class="analysis-list-item" onclick="flyToHighDensityCluster(${index})">
                ${cluster.iconHtml || ''}
                <span class="analysis-item-name" title="${cluster.name}">${cluster.name}</span>
                <span class="count-badge">${cluster.count}</span>
            </div>
        `).join('');
    } else {
        highDensityList.innerHTML = '<p style="padding: 10px; color: #888;">Không có.</p>';
    }

    // Tạo HTML cho danh sách Tương Quan
    if (correlatedClusters.length > 0) {
        correlatedList.innerHTML = correlatedClusters.map((cluster, index) => `
            <div class="analysis-list-item" onclick="flyToCorrelatedCluster(${index})">
                ${cluster.iconHtml || ''}
                <span class="analysis-item-name" title="${cluster.name}">${cluster.name}</span>
                <span class="count-badge">${cluster.count}</span>
            </div>
        `).join('');
    } else {
        correlatedList.innerHTML = '<p style="padding: 10px; color: #888;">Không có.</p>';
    }
}

// Các hàm này phải được truy cập toàn cục để onclick hoạt động
window.flyToHighDensityCluster = function(index) {
    const cluster = highDensityClusters[index];
    if (cluster) {
        map.flyTo(cluster.center, 15);
    }
};

window.flyToCorrelatedCluster = function(index) {
    const cluster = correlatedClusters[index];
    if (cluster) {
        map.flyTo(cluster.center, 15);
    }
};