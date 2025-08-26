// File này chứa logic phân tích mật độ và tương tác sử dụng DBSCAN.
// Nó không sử dụng thuộc tính Category.

// Hằng số cho bán kính DBSCAN (tính theo độ, ví dụ 0.01 độ ~ 1km)
const DBSCAN_EPSILON = 1.5;
// Số điểm tối thiểu để tạo thành một cụm
const DBSCAN_MIN_POINTS = 3;

/**
 * Sử dụng DBSCAN để phân tích và trực quan hóa các cụm ghim.
 * Phân loại cụm dựa trên loại ghim (điểm nóng, tác động).
 */
function runDBScanAnalysis() {
    if (!isAnalysisMode) {
        if (interactionLayerGroup) {
            map.removeLayer(interactionLayerGroup);
        }
        return;
    }

    // LẤY DỮ LIỆU TỪ CÁC GHIM ĐÃ ĐƯỢC LỌC VÀ HIỂN THỊ
    // Lấy các lớp (layers) đang có trong markerLayerGroup
    const filteredLayers = markerLayerGroup.getLayers();
    // Chuyển đổi các lớp này thành dữ liệu ghim
    const visibleMarkers = filteredLayers.map(layer => layer.markerData);

    // Xóa tất cả các ghim hiện có để chỉ hiển thị kết quả phân tích
    markerLayerGroup.clearLayers();

    if (interactionLayerGroup) {
        map.removeLayer(interactionLayerGroup);
    }
    interactionLayerGroup = L.layerGroup().addTo(map);

    if (visibleMarkers.length < DBSCAN_MIN_POINTS) {
        visibleMarkers.forEach(marker => {
            const markerType = markerTypes[marker.type];
            if (markerType) {
                 L.circleMarker([marker.lat, marker.lng], {
                    radius: 6,
                    color: 'blue',
                    fillOpacity: 0.8
                }).addTo(interactionLayerGroup).bindPopup(`Mật độ thấp: ${markerType.name}`);
            }
        });
        return;
    }

    const coords = visibleMarkers.map(d => [d.lat, d.lng]);
    const dbscan = new DBSCAN();

    const clusters = dbscan.run(coords, DBSCAN_EPSILON, DBSCAN_MIN_POINTS, (a, b) => {
      const R = 6371;
      const dLat = (a[0]-b[0]) * Math.PI/180;
      const dLon = (a[1]-b[1]) * Math.PI/180;
      const lat1 = a[0]*Math.PI/180, lat2 = b[0]*Math.PI/180;
      const x = dLon * Math.cos((lat1+lat2)/2);
      const y = dLat;
      return Math.sqrt(x*x + y*y) * R;
    });

    clusters.forEach(cluster => {
        if (cluster.isNoise) {
            const noiseMarker = visibleMarkers[cluster.index];
            const markerType = markerTypes[noiseMarker.type];
            if (markerType) {
                L.circleMarker([noiseMarker.lat, noiseMarker.lng], {
                    radius: 6,
                    color: 'blue',
                    fillOpacity: 0.8
                }).addTo(interactionLayerGroup).bindPopup(`Mật độ thấp: ${markerType.name}`);
            }
            return;
        }

        const members = cluster.map(i => visibleMarkers[i]);
        const membersByType = members.reduce((acc, member) => {
            (acc[member.type] = acc[member.type] || []).push(member);
            return acc;
        }, {});
        
        const uniqueTypes = Object.keys(membersByType);
        
        let mainColor, mainPopupText;

        if (uniqueTypes.length > 1) {
            mainColor = 'yellow';
            mainPopupText = `Vùng tác động giữa các loại: ${uniqueTypes.map(t => markerTypes[t]?.name).join(', ')}`;
        } else {
            mainColor = 'red';
            const typeKey = uniqueTypes[0];
            const typeName = markerTypes[typeKey]?.name;
            mainPopupText = `Điểm nóng: ${typeName} tập trung`;
        }

        const allLatlngs = members.map(m => [m.lat, m.lng]);
        const mainBounds = L.latLngBounds(allLatlngs);
        const mainCenter = mainBounds.getCenter();
        const mainRadius = map.distance(mainCenter, mainBounds.getNorthWest());

        L.circle(mainCenter, {
            radius: mainRadius,
            color: mainColor,
            fillOpacity: 0.1,
            weight: 2
        }).addTo(interactionLayerGroup).bindPopup(mainPopupText);

        uniqueTypes.forEach(typeKey => {
            const typeMembers = membersByType[typeKey];
            if (typeMembers.length < 2) return; // Bỏ qua nếu chỉ có 1 ghim loại này trong cụm

            const typeLatlngs = typeMembers.map(m => [m.lat, m.lng]);
            // Sửa lỗi: Thêm kiểm tra số lượng điểm trước khi tạo bounds
            if (typeLatlngs.length < 2) {
                return; 
            }
            
            const typeBounds = L.latLngBounds(typeLatlngs); // Sửa: Sử dụng L.latLngBounds
            const typeCenter = typeBounds.getCenter();
            const typeRadius = map.distance(typeCenter, typeBounds.getNorthWest());

            let typeColor = mainColor;
            if (mainColor === 'yellow' && typeMembers.length > 2) {
                typeColor = 'orange';
            }

            L.circle(typeCenter, {
                radius: typeRadius,
                color: typeColor,
                fillOpacity: 0.3,
                weight: 1
            }).addTo(interactionLayerGroup).bindPopup(`Mật độ cao: ${markerTypes[typeKey]?.name}`);

            typeMembers.forEach(m => {
                 L.circleMarker([m.lat, m.lng], {
                    radius: 4,
                    color: typeColor,
                    fillOpacity: 1
                }).addTo(interactionLayerGroup);
            });
        });
    });
}