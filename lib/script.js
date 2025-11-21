let map;
let selectedTypeKeys = new Set();
let selectedUserOwners = new Set();
let markerTypes = {};
let markerLayerGroup = L.markerClusterGroup({ maxClusterRadius: 40 });
let initialView = JSON.parse(localStorage.getItem('mapInitialView')) || { lat: 10.4633, lng: 105.6325, zoom: 14 };
const GOOGLE_SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbwXdHqVAwISg6Db9-OPoZIxbUrSAm6U1g49ynaQ8h19hW9bp8arFqiyxZkhDYTP4qM75A/exec';
const MARKER_CACHE_KEY = 'allMarkersCache';
let allAccounts = []; // Biến mới để lưu danh sách tài khoản
let currentUser = null; // Biến mới để lưu thông tin người dùng đã đăng nhập
let isPopupOpen = false;
let isAnalysisMode = false;
let interactionLayerGroup;
let allMarkersData = [];
let highDensityClusters = [];
let correlatedClusters = [];
let isHeatmapMode = false; // Biến mới cho trạng thái heatmap
let heatLayer = null; // Biến mới để giữ lớp heatmap
let timelineMinDate = null;
let timelineMaxDate = null;
let selectedTimelineStartDate = null;
let selectedTimelineEndDate = null;
let isDrawing = false;
let epsilonContainer, epsilonSlider, epsilonValueLabel, minPointsInput, loginUsernameInput, loginPasswordInput, toggleBtn;
    function clearAnalysisResults() {
        highDensityClusters = [];
        correlatedClusters = [];
        const highDensityList = document.getElementById('high-density-list');
        const correlatedList = document.getElementById('correlated-list');
        if (highDensityList) highDensityList.innerHTML = '';
        if (correlatedList) correlatedList.innerHTML = '';
    }

    function correctUTCToLocalDay(isoString) {
        if (!isoString || isoString.length < 10) {
            return '';
        }
        
        // 1. Tạo đối tượng Date (Nó sẽ chứa thời gian chính xác, ví dụ: 2025-11-20 17:00:00 GMT)
        const dateObj = new Date(isoString);

        // Kiểm tra tính hợp lệ
        if (isNaN(dateObj)) {
            return '';
        }

        // 2. 🚨 QUAN TRỌNG: Sử dụng các hàm get...() (Local Time)
        // để lấy ngày/tháng/năm sau khi đã áp dụng múi giờ địa phương.
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0'); // Tháng (0-11) + 1
        const day = String(dateObj.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    }
    toggleBtn = document.getElementById('toggle-btn');
// Bắt đầu toàn bộ mã khi cây DOM đã sẵn sàng
document.addEventListener('DOMContentLoaded', function () {
    loginUsernameInput = document.getElementById('username-input');
    loginPasswordInput = document.getElementById('password-input');
    epsilonContainer = document.getElementById('epsilon-container');
    epsilonSlider = document.getElementById('epsilon-slider');
    epsilonValueLabel = document.getElementById('epsilon-value-label');
    minPointsInput = document.getElementById('dbscan-min-points');

    // Tải giá trị MinPoints đã lưu hoặc dùng mặc định
    minPointsInput.value = localStorage.getItem('dbscanMinPoints') || 3;

    // Xử lý sự kiện thay đổi MinPoints
    minPointsInput.addEventListener('change', () => {
        localStorage.setItem('dbscanMinPoints', minPointsInput.value);
        if (isAnalysisMode) masterFilter();
    });

    // Hàm cập nhật nhãn cho thanh trượt
    function updateEpsilonLabel(valueMeters) {
        epsilonValueLabel.textContent = (valueMeters < 1000)
            ? `${valueMeters}m`
            : `${(valueMeters / 1000).toFixed(1)}km`;
    }
    updateEpsilonLabel(epsilonSlider.value);

    // Xử lý sự kiện kéo thanh trượt
    epsilonSlider.addEventListener('input', e => updateEpsilonLabel(e.target.value));
    epsilonSlider.addEventListener('change', () => {
        if (isAnalysisMode) masterFilter();
    });
    // --- CẤU HÌNH BAN ĐẦU ---
    const MarkerIcon = L.Icon.extend({
        options: {
            iconSize: [20, 33],       // Gốc là [25, 41]
            iconAnchor: [10, 33],      // Gốc là [12, 41]
            popupAnchor: [1, -28],     // Gốc là [1, -34]
            shadowUrl: '/icons/marker-shadow.png',
            shadowSize: [33, 33],      // Gốc là [41, 41]
            shadowAnchor: [10, 33]     // Gốc là [12, 41]
        }
    });
    const availableIcons = [
        // --- Các ghim màu cơ bản (vẫn giữ lại để linh hoạt) ---
        '/icons/marker-icon-2x-red.png',
        '/icons/marker-icon-2x-blue.png',
        '/icons/marker-icon-2x-green.png',
        '/icons/marker-icon-2x-orange.png',
        '/icons/marker-icon-2x-yellow.png',
        '/icons/marker-icon-2x-violet.png',
        '/icons/marker-icon-2x-grey.png',
        '/icons/marker-icon-2x-black.png',

        // --- Biểu tượng nghiệp vụ ---
        // Cơ quan quan trọng
        '/icons/1191618.png',   // Trụ sở Công an
        '/icons/799355.png',     // Tòa án, Viện kiểm sát
        '/icons/2045655.png',   // Đơn vị quân đội

        // Sự kiện ANTT
        '/icons/3593990.png',   // Hiện trường vụ án
        '/icons/3048596.png',   // Tai nạn giao thông
        '/icons/942791.png',     // Cháy nổ

        // Đối tượng
        '/icons/5300195.png',   // Đối tượng nghi vấn
        '/icons/190714.png',     // Đối tượng truy nã
        '/icons/9835398.png',   // Nhân chứng
        '/icons/policeman-male.png', // Cán bộ chiến sĩ

        // Các loại kết nối và nội dung khác
        '/icons/1022336.png',   // Mối quan hệ
        '/icons/1389143.png',   // Gặp gỡ, giao tiếp
        '/icons/159594.png',     // Điểm giám sát (CCTV)
        '/icons/26229.png',       // Mục tiêu cần chú ý
        '/icons/link.png',      // Liên kết, kết nối
        '/icons/gun.png',       // Vũ khí, vật chứng
        '/icons/handcuffs.png', // Bắt giữ
        '/icons/wallmount-camera.png',
        // --- Nhân sự & Đơn vị ---
        '/icons/detective.png',      // Trinh sát / Điều tra viên
        '/icons/police-badge.png',    // Huy hiệu Ngành / Xác thực
        '/icons/shield.png',          // Cảnh sát Cơ động / Chống bạo động
        

        // --- Trang thiết bị & Công cụ ---
        '/icons/fingerprint.png',     // Dấu vết sinh học / Giám định

        // --- Phương tiện ---
        '/icons/helicopter.png',      // Trực thăng / Hỗ trợ trên không

        // --- Địa điểm & Cơ sở vật chất ---
        '/icons/police-station.png',  // Công an Phường/Quận/Huyện
        '/icons/prison.png',          // Nhà tù / Trại giam

        // --- Sự vụ & Loại hình Tội phạm ---
        '/icons/siren.png',           // Tình huống khẩn cấp
        '/icons/robber.png',          // Trộm cắp / Cướp giật
        '/icons/pill.png',            // Tội phạm ma túy
        '/icons/hacking.png',         // Tội phạm mạng

        // --- Hành động & Quy trình Nghiệp vụ ---
        '/icons/search.png',          // Khám xét / Điều tra
        '/icons/evidence.png',        // Vật chứng (chung)
        '/icons/fire-element.png',
        '/icons/education.png',
        '/icons/external-fire-sign-navigation-solid-style-solid-style-bomsymbols-.png',
        '/icons/pagoda.png',
        '/icons/building.png',
        '/icons/thumbtack.png',
        '/icons/car-alt.png',
        '/icons/school.png',
        '/icons/glass-cheers.png',
        '/icons/chess-knight-alt.png',
        '/icons/cars-crash.png',
        '/icons/person.png',
    ];

    // let allMarkersData = [];

    // map = L.map('map', { maxZoom: 17 }).setView([initialView.lat, initialView.lng], initialView.zoom);
    // disableMapInteraction();
    // markerLayerGroup.addTo(map);

    // L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© <a href="http://openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
    // 1. Định nghĩa các lớp bản đồ (base layers)
    const streetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        attribution: '© <a href="http://openstreetmap.org/copyright">OpenStreetMap</a>'
    });

    const satelliteMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 17,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    });

    const topoMap = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
    });

    const baseLayers = {
        "Bản đồ đường phố": streetMap,
        "Ảnh vệ tinh": satelliteMap,
        "Bản đồ địa hình": topoMap
    };

    // 2. Khởi tạo bản đồ và đặt lớp mặc định là bản đồ đường phố
    map = L.map('map', {
        maxZoom: 17,
        layers: [streetMap] // Lớp mặc định khi tải
    }).setView([initialView.lat, initialView.lng], initialView.zoom);

    disableMapInteraction();

    // 3. Định nghĩa các lớp phủ (overlays) như các điểm đã ghim
    const overlays = {
        "Các địa điểm đã ghim": markerLayerGroup
    };
    markerLayerGroup.addTo(map);

    // 4. Thêm bộ điều khiển lớp vào bản đồ
    L.control.layers(baseLayers, overlays, { position: 'bottomleft' }).addTo(map);
    //quản lý analysis
    const analysisBtn = document.getElementById('toggle-analysis-btn');
    if (analysisBtn) {
        analysisBtn.addEventListener('click', () => {
            isAnalysisMode = !isAnalysisMode;
            const resultsContainer = document.getElementById('analysis-results-container');
            epsilonContainer.classList.toggle('active', isAnalysisMode);
            if (isAnalysisMode) {
                analysisBtn.textContent = 'Tắt Phân Tích';
                analysisBtn.style.backgroundColor = '#dc3545';
                resultsContainer.style.display = 'block';

                // Tắt chế độ heatmap nếu đang bật
                if (isHeatmapMode) {
                    isHeatmapMode = false;
                    const heatmapBtn = document.getElementById('toggle-heatmap-btn');
                    // heatmapBtn.textContent = 'Bật Bản Đồ Nhiệt';
                    heatmapBtn.style.backgroundColor = '#dc3545';
                }

            } else {
                analysisBtn.textContent = 'Bật Phân Tích';
                analysisBtn.style.backgroundColor = '#28a745';
                resultsContainer.style.display = 'none';
                clearAnalysisResults();
            }
            masterFilter();
        });
    }
    
    // --- HÀM VẼ MARKER & POPUP ---
    function renderMarker(markerData) {
        const markerType = markerTypes ? markerTypes[markerData.type] : null;
        if (!markerType) return;

        // --- XỬ LÝ CÁC THÔNG TIN PHỤ ĐỂ HIỂN THỊ ---

        // 1. Xử lý Mô tả (Xem thêm/Thu gọn)
        const fullDescription = markerData.desc || '<i>Không có mô tả</i>';
        let descriptionHtml = `<span class="full-desc">${fullDescription}</span>`;
        if (fullDescription.length > 100) {
            const truncatedDescription = fullDescription.substring(0, 100);
            descriptionHtml = `
                <span class="truncated-desc">${truncatedDescription}... <a href="#" class="toggle-desc-link show-more">Xem thêm</a></span>
                <span class="full-desc" style="display: none;">${fullDescription} <a href="#" class="toggle-desc-link show-less">Thu gọn</a></span>
            `;
        }

        // 2. Gom nhóm các thông tin phụ (Ngày, Người tạo, Link) vào một khối
        let metadataHtml = '';
         // Hiển thị Link (nếu có)
        if (markerData.linkUrl) {
            const displayUrl = markerData.linkUrl.length > 30 ? markerData.linkUrl.substring(0, 27) + '...' : markerData.linkUrl;
            metadataHtml += `
                <div class="info-field">
                    <strong><i class="fa-solid fa-link"></i> Liên kết: </strong>
                    <a href="${markerData.linkUrl}" target="_blank" rel="noopener noreferrer" title="${markerData.linkUrl}">${displayUrl}</a>
                </div>`; // Đã xóa dấu cách
        }
        // SỬA LỖI ĐỊNH DẠNG NGÀY: Dùng đối tượng Date để xử lý an toàn
        if (markerData.inclusionDate) {
            const dateObj = new Date(markerData.inclusionDate);
            // Lấy ngày/tháng/năm và thêm số 0 ở đầu nếu cần
            const day = String(dateObj.getDate()).padStart(2, '0');
            const month = String(dateObj.getMonth() + 1).padStart(2, '0'); // Tháng bắt đầu từ 0
            const year = dateObj.getFullYear();
            const formattedDate = `${day}/${month}/${year}`;
            metadataHtml += `<div class="info-field"><strong><i class="fa-solid fa-calendar-day"></i> Ngày vào diện: </strong> ${formattedDate}</div>`;
        }

        // Hiển thị Người tạo (chỉ cho Admin)
        if (currentUser && currentUser.Role === 'Admin' && markerData.Owner) {
            metadataHtml += `<div class="info-field"><strong><i class="fa-solid fa-user-pen"></i> Người tạo: </strong>${markerData.Owner}</div>`;
        }
        if (metadataHtml.length>0) metadataHtml ='<div class="info-metadata">' + metadataHtml + '</div>';

        // --- TẠO NỘI DUNG POPUP HOÀN CHỈNH ---
        const popupContent = `
            <div class="info-popup">
                <h5>${markerData.name}</h5>
                <div class="description-container"><strong>Mô tả: </strong><p>${descriptionHtml}</p></div>
                ${metadataHtml}
                <div class="coords">
                    <span onclick="copyCoords(${markerData.lat}, ${markerData.lng}); event.stopPropagation();" title="Bấm để sao chép tọa độ" style="cursor: pointer; font-weight: bold;">
                        ${markerData.lat.toFixed(5)}, ${markerData.lng.toFixed(5)}
                    </span>
                    <span class="coord-actions">
                        <a href="#" onclick="event.stopPropagation(); window.openEditMarkerPopup(${markerData.id})" title="Chỉnh sửa ghim"><i class="fa-solid fa-pencil"></i></a>
                        <a href="#" onclick="event.stopPropagation(); window.deleteMarker(${markerData.id}); map.closePopup();" title="Xóa ghim"><i class="fa-solid fa-trash-can"></i></a>                        
                        <a href="https://www.google.com/maps/dir/?api=1&destination=${markerData.lat},${markerData.lng}" target="_blank" title="Chỉ đường Google Maps"><i class="fa-solid fa-diamond-turn-right"></i></a>
                    </span>
                </div>
            </div>`;

        // --- VẼ MARKER LÊN BẢN ĐỒ ---
        const marker = L.marker([markerData.lat, markerData.lng], { icon: markerType.icon });
        marker.bindPopup(popupContent);
        marker.markerData = markerData;
        markerLayerGroup.addLayer(marker);

        // Gắn sự kiện cho link "Xem thêm"
        marker.on('popupopen', function (e) {
            // Lấy các phần tử DOM từ popup vừa mở
            const popupNode = e.popup.getElement();
            if (!popupNode) return;

            const showMoreLink = popupNode.querySelector('.show-more');
            const showLessLink = popupNode.querySelector('.show-less');
            const truncatedDesc = popupNode.querySelector('.truncated-desc');
            const fullDescSpan = popupNode.querySelector('.full-desc');

            // Gắn sự kiện click cho link "Xem thêm"
            if (showMoreLink && truncatedDesc && fullDescSpan) {
                showMoreLink.onclick = function(event) {
                    event.preventDefault(); // Ngăn trang cuộn lên đầu
                    truncatedDesc.style.display = 'none';
                    fullDescSpan.style.display = 'block';
                };
            }

            // Gắn sự kiện click cho link "Thu gọn"
            if (showLessLink && truncatedDesc && fullDescSpan) {
                showLessLink.onclick = function(event) {
                    event.preventDefault();
                    fullDescSpan.style.display = 'none';
                    truncatedDesc.style.display = 'block';

                };
            }
        });
    }

    // --- DANH SÁCH ĐỊA ĐIỂM ĐÃ GHIM ---
    function populatePinnedList(filteredData) {
        const container = document.getElementById('pinned-list');
        const header = document.getElementById('pinned-list-header');

        // Cập nhật tiêu đề với tổng số ghim
        if (header) {
            header.innerHTML = `<i class="fa-solid fa-thumbtack"></i> Danh sách đã ghim (${filteredData.length})`;
        }

        container.innerHTML = ''; 

        if (filteredData.length === 0) {
            container.innerHTML = '<p style="padding: 10px; color: #888;">Không tìm thấy địa điểm nào khớp.</p>';
            return;
        }

        const groupedByType = filteredData.reduce((acc, marker) => {
            (acc[marker.type] = acc[marker.type] || []).push(marker);
            return acc;
        }, {});

        for (const typeKey in groupedByType) {
            const typeInfo = markerTypes[typeKey];
            if (!typeInfo) continue;

            const details = document.createElement('details');
            details.open = false;
            const summary = document.createElement('summary');
            
            // --- START SỬA ĐỔI TẠI ĐÂY ---
            const safeTypeName = typeInfo.name.replace(/"/g, '&quot;'); // Xử lý nếu tên có dấu ngoặc kép
            summary.innerHTML = `
                <img src="${typeInfo.icon.options.iconUrl}" width="12" style="margin-right: 5px; flex-shrink: 0;">
                <span class="pinned-list-type-name" title="${safeTypeName}">${typeInfo.name}</span>
                <span style="flex-shrink: 0;">(${groupedByType[typeKey].length})</span>
            `;
            // --- END SỬA ĐỔI ---
            
            const ul = document.createElement('ul');
            groupedByType[typeKey].forEach(markerData => {
                const li = document.createElement('li');
                
                const nameSpan = document.createElement('span');
                nameSpan.className = 'marker-name';
                nameSpan.textContent = markerData.name || '(Chưa có tên)';
                nameSpan.onclick = () => flyToMarker(markerData.id);
                
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-btn';
                deleteBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
                deleteBtn.title = 'Xóa địa điểm này';
                deleteBtn.onclick = (event) => {
                    event.stopPropagation();
                    window.deleteMarker(markerData.id);
                };
                
                li.appendChild(nameSpan);
                li.appendChild(deleteBtn);
                ul.appendChild(li);
            });

            details.appendChild(summary);
            details.appendChild(ul);
            container.appendChild(details);
        }
    }

    // --- QUẢN LÝ LOẠI ĐỊA ĐIỂM ---
window.deleteMarker = async function(markerId) {
    const markerToDelete = allMarkersData.find(m => m.id === markerId);
    if (!markerToDelete) return;
    
    if (!currentUser || (currentUser.Role === 'Viewer' && markerToDelete.Owner !== currentUser.Username) || (currentUser.Role === 'Editor' && markerToDelete.Owner !== currentUser.Username)) {
        alert("Bạn không có quyền xóa ghim này.");
        return;
    }

    if (!confirm("Bạn có chắc chắn muốn xóa địa điểm này?")) return;
    
    allMarkersData = allMarkersData.filter(m => m.id !== markerId);
    
    let layerToRemove = null;
    markerLayerGroup.getLayers().forEach(layer => {
        if (layer.markerData && layer.markerData.id == markerId) layerToRemove = layer;
    });
    if (layerToRemove) markerLayerGroup.removeLayer(layerToRemove);
    // Lấy lại danh sách những người tạo còn hợp lệ từ dữ liệu mới
    const validOwners = new Set(allMarkersData.map(m => m.Owner).filter(Boolean));
    // Lọc lại danh sách những người đang được chọn trong bộ lọc,
    // chỉ giữ lại những ai còn hợp lệ.
    selectedUserOwners = new Set(
        [...selectedUserOwners].filter(owner => validOwners.has(owner))
    );
    updateUI();
    setupTimelineSlider();
    // Gửi yêu cầu xóa ghim lên Google Sheet
    try {
        // THÊM headers VÀO YÊU CẦU FETCH
        await fetch(GOOGLE_SHEET_API_URL, {
            method: 'POST',
            // headers: {
            //     'Content-Type': 'application/json',
            // },
            body: JSON.stringify({ action: 'deleteMarker', markerId: markerId })
        });
    } catch (error) {
        console.error('Lỗi khi xóa ghim:', error);
    }
};
    function renameMarkerType(typeKey) {
        if (!currentUser || currentUser.Role !== 'Admin') {
            alert("Bạn không có quyền thực hiện hành động này.");
            return;
        }
        const oldName = markerTypes[typeKey].name;
        const newName = prompt(`Nhập tên mới cho loại "${oldName}":`, oldName);

        // Nếu người dùng bấm "Cancel" hoặc không nhập gì, thì không làm gì cả
        if (newName === null || newName.trim() === '') {
            return;
        }

        // Cập nhật tên mới vào đối tượng markerTypes
        markerTypes[typeKey].name = newName.trim();

        // Cập nhật lại toàn bộ giao diện để hiển thị tên mới
        updateUI();
        saveTypes();
    }
    async function addNewMarkerType(name, iconUrl) {
        if (!currentUser || currentUser.Role !== 'Admin') {
            alert("Bạn không có quyền thực hiện hành động này.");
            return;
        }
        let namestr = String(name || '');
        const key = namestr.toLowerCase().replace(/\s+/g, '_').replace(/[^\w-]+/g, '');
        // console.log(namestr.trim().length,iconUrl.length,namestr.trim(),key,iconUrl,namestr)
        if (!namestr.trim() || !iconUrl) {
            alert("Vui lòng nhập tên loại và chọn một icon.");
            return;
        } 
        if (!key) { // Tách riêng kiểm tra 'key'
            alert("Tên loại không hợp lệ, không thể chứa toàn ký tự đặc biệt.");
            return;
        }
        if (markerTypes.hasOwnProperty(key)) {
            alert("Loại địa điểm này đã tồn tại.");
            return;
        }

        markerTypes[key] = { name: name, icon: new MarkerIcon({ iconUrl: iconUrl }) };
        await saveTypes(); // Đợi lưu xong
        //await loadMarkers(); // Tải lại dữ liệu mới nhất
        updateUI(); // Cập nhật giao diện với dữ liệu mới
    }

    async function deleteMarkerType(typeKey) {
        if (!currentUser || currentUser.Role !== 'Admin') {
            alert("Bạn không có quyền thực hiện hành động này.");
            return;
        }
        if (!confirm(`BẠN CÓ CHẮC CHẮN MUỐN XÓA LOẠI "${markerTypes[typeKey].name}"? \n\nHành động này sẽ xóa vĩnh viễn TẤT CẢ CÁC GHIM thuộc loại này và không thể hoàn tác.`)) {
            return;
        }

        // 1. Lấy danh sách ID của các ghim sắp bị xóa để gửi lên server
        const markerIdsToDelete = allMarkersData
            .filter(marker => marker.type === typeKey)
            .map(marker => marker.id);

        // 2. Xóa dữ liệu và ghim trên giao diện (như cũ)
        allMarkersData = allMarkersData.filter(marker => marker.type !== typeKey);
        markerLayerGroup.eachLayer(layer => {
            if (layer.markerData && layer.markerData.type === typeKey) {
                markerLayerGroup.removeLayer(layer);
            }
        });
        delete markerTypes[typeKey];

        // 3. Cập nhật giao diện và lưu lại danh sách loại ghim
        updateUI();
        await saveTypes();
        // await loadMarkers();
        masterFilter();
        updateSelectAllState("types");

        // 4. MỚI: Gửi yêu cầu xóa hàng loạt các ghim lên Google Sheet
        if (markerIdsToDelete.length > 0) {
            try {
                const response = await fetch(GOOGLE_SHEET_API_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'deleteMarkersBatch',
                        markerIds: markerIdsToDelete
                    })
                });
                const result = await response.json();
                if (result.success) {
                    console.log(`Đã xóa thành công ${markerIdsToDelete.length} ghim trên server.`);
                } else {
                    alert("Có lỗi xảy ra khi xóa ghim trên server: " + result.message);
                }
            } catch (error) {
                console.error('Lỗi khi gửi yêu cầu xóa hàng loạt ghim:', error);
                alert('Có lỗi mạng xảy ra khi đồng bộ hóa việc xóa ghim.');
            }
        }
    }

function populateTypeManager() {
    const typeManagerDiv = document.getElementById('add-marker-type-form');
    let existingTypesContainer = typeManagerDiv.querySelector('#existing-types-container');
    if (existingTypesContainer) existingTypesContainer.remove();

    existingTypesContainer = document.createElement('div');
    existingTypesContainer.id = 'existing-types-container';

    const typeSearchTerm = document.getElementById('type-search-input').value.toLowerCase();
    const typeCounts = allMarkersData.reduce((acc, marker) => {
        acc[marker.type] = (acc[marker.type] || 0) + 1;
        return acc;
    }, {});

    const details = document.createElement('details');
    details.open = false;
    const summary = document.createElement('summary');
    summary.innerHTML = '<h4>Các loại hiện có:</h4>';
    details.appendChild(summary);

    // --- START: Thêm thẻ div để bao bọc và tạo thanh cuộn ---
    const listWrapper = document.createElement('div');
    listWrapper.className = 'type-list-scrollable';
    // --- END: Thêm thẻ div ---

    let visibleCount = 0;
    let hasContent = false;
    for (const key in markerTypes) {
        if (markerTypes.hasOwnProperty(key)) {
            const typeInfo = markerTypes[key];
            if (typeInfo && typeof typeInfo.name === 'string' && typeInfo.name.toLowerCase().includes(typeSearchTerm)) {
                hasContent = true;
                visibleCount++;
                const count = typeCounts[key] || 0;
                const typeItem = document.createElement('div');
                typeItem.className = 'type-item';
                typeItem.innerHTML = `
                    <span class="type-name-wrapper"><img src="${typeInfo.icon.options.iconUrl}" width="12" style="margin-right: 8px;"> ${typeInfo.name}</span>
                    <span class="type-item-actions">
                        <button class="edit-type-btn" data-type="${key}" title="Đổi tên loại"><i class="fa-solid fa-pencil"></i></button>
                        <button class="delete-type-btn" data-type="${key}" title="Xóa loại này"><i class="fa-solid fa-xmark"></i></button>
                    </span>`;
                // --- START: Thêm mục vào listWrapper thay vì details ---
                listWrapper.appendChild(typeItem);
                // --- END: Thêm mục vào listWrapper ---
            }
        }
    }
    
    // --- START: Thêm listWrapper vào details ---
    if(hasContent) {
        details.appendChild(listWrapper);
    }
    // --- END: Thêm listWrapper vào details ---

    const mainHeader = document.getElementById('type-manager-header');
    if (mainHeader) {
        mainHeader.innerHTML = `<i class="fa-solid fa-tags"></i> Quản lý loại địa điểm (${visibleCount})`;
    }
    
    if (hasContent) {
        existingTypesContainer.appendChild(details);
        typeManagerDiv.appendChild(existingTypesContainer);
        details.querySelectorAll('.delete-type-btn').forEach(button => {
            button.addEventListener('click', function() { deleteMarkerType(this.dataset.type); });
        });
        details.querySelectorAll('.edit-type-btn').forEach(button => {
            button.addEventListener('click', function() { renameMarkerType(this.dataset.type); });
        });
    }
}

    function saveMarkerTypesToStorage() {
        const storableTypes = {};
        for (const key in markerTypes) {
            storableTypes[key] = { name: markerTypes[key].name, iconUrl: markerTypes[key].icon.options.iconUrl };
        }
        localStorage.setItem('customMarkerTypes', JSON.stringify(storableTypes));
    }

    // function loadMarkerTypesFromStorage() {
    //     const storedTypes = JSON.parse(localStorage.getItem('customMarkerTypes'));
    //     if (storedTypes && Object.keys(storedTypes).length > 0) {
    //         for (const key in storedTypes) {
    //             markerTypes[key] = { name: storedTypes[key].name, icon: new MarkerIcon({ iconUrl: storedTypes[key].iconUrl }) };
    //         }
    //     } else {
    //         markerTypes = {
    //             'restaurant': { name: 'Nhà hàng', icon: new MarkerIcon({ iconUrl: availableIcons[2] }) },
    //             'school': { name: 'Trường học', icon: new MarkerIcon({ iconUrl: availableIcons[0] }) }
    //         };
    //     }
    // }

    // 1. HÀM LỌC TỔNG: Trung tâm xử lý mọi bộ lọc
function masterFilter() {
    // Nếu không ở chế độ phân tích, xóa layer tương tác
    if (interactionLayerGroup && !isAnalysisMode) {
        map.removeLayer(interactionLayerGroup);
    }

    const searchTerm = document.getElementById('search-pinned') ? document.getElementById('search-pinned').value.toLowerCase() : '';
    
    // BƯỚC 1: KHAI BÁO VÀ ÁP DỤNG BỘ LỌC BẮT BUỘC DỰA TRÊN VAI TRÒ
    // Khai báo `filteredData` ngay từ đầu và gán giá trị dựa trên quyền của người dùng.
    // Đây là bước quan trọng nhất để sửa lỗi.
    let filteredData;

    if (currentUser) {
        const userRole = currentUser.Role.toLowerCase();

        if (userRole === 'viewer') {
            // **Viewer:** Chỉ thấy ghim của chính mình.
            filteredData = allMarkersData.filter(marker => marker.Owner === currentUser.Username);
        } else if (userRole === 'editor') {
            // **Editor:** Thấy ghim của mình VÀ của tất cả Viewers
            filteredData = allMarkersData.filter(marker => marker.Owner === currentUser.Username || marker.Owner === 'viewer');
        } else {
            // **Admin:** Mặc định thấy tất cả ghim.
            filteredData = allMarkersData;
        }
    } else {
        // Nếu không đăng nhập, không có dữ liệu để hiển thị.
        filteredData = [];
    }
    
    // BƯỚC 2: ÁP DỤNG CÁC BỘ LỌC TỪ GIAO DIỆN NGƯỜI DÙNG (UI FILTERS)
    // Các bộ lọc này sẽ hoạt động trên tập dữ liệu đã được giới hạn bởi vai trò ở trên.
    let uiFilteredData = filteredData.filter(marker => {
        if (!marker) return false;
        
        const typeMatch = selectedTypeKeys.has(marker.type);
        const userMatch = selectedUserOwners.has(marker.Owner);

        const timelineMatch = (() => {
            if (!selectedTimelineStartDate || !selectedTimelineEndDate) return true;
            if (!marker.inclusionDate) return true;
            const markerDate = new Date(marker.inclusionDate);
            return markerDate.setHours(0,0,0,0) <= selectedTimelineEndDate.setHours(0,0,0,0);
        })();

        return typeMatch && userMatch && timelineMatch;
    });

    // Lọc theo ô tìm kiếm (giữ nguyên)
    if (searchTerm) {
        uiFilteredData = uiFilteredData.filter(marker => 
            (marker.name && marker.name.toLowerCase().includes(searchTerm)) || 
            (marker.desc && marker.desc.toLowerCase().includes(searchTerm))
        );
    }

    // Phần còn lại của hàm (vẽ heatmap, cluster, v.v...) giữ nguyên không đổi
    markerLayerGroup.clearLayers();
    if (heatLayer) {
        map.removeLayer(heatLayer);
        heatLayer = null;
    }
    populatePinnedList(uiFilteredData);
    if (isHeatmapMode) {
        if (uiFilteredData.length > 0) {
            const heatPoints = uiFilteredData.map(marker => [marker.lat, marker.lng]);
            heatLayer = L.heatLayer(heatPoints, {
                radius: 25,
                blur: 15,
                maxZoom: 17,
                gradient: { 0.0: 'transparent', 0.2: 'red', 0.4: 'darkred', 0.6: '#8B0000', 1.0: '#4B0000' }
            }).addTo(map);
        }
    } else if (isAnalysisMode) {
        const epsilonMeters = parseInt(epsilonSlider.value);
        const epsilonKm = epsilonMeters / 1000;
        const minPoints = parseInt(minPointsInput.value);
        runDBScanAnalysis(uiFilteredData, epsilonKm, minPoints);
    } else {
        uiFilteredData.forEach(renderMarker);
    }
}

    // 2. HÀM CẬP NHẬT GIAO DIỆN BỘ LỌC LOẠI
    function populateTypeFilter() {
        const container = document.getElementById('type-filter-list');
        if (!container) return; // Thêm kiểm tra an toàn
        container.innerHTML = '';

        const typeSearchInput = document.getElementById('type-search-input');
        const typeSearchTerm = typeSearchInput ? typeSearchInput.value.toLowerCase() : '';

        Object.keys(markerTypes).forEach(typeKey => {
            const markerType = markerTypes[typeKey];

            // SỬA LỖI: Thêm điều kiện kiểm tra markerType và markerType.name tồn tại
            if (markerType && typeof markerType.name === 'string' && markerType.name.toLowerCase().includes(typeSearchTerm)) {
                const isChecked = selectedTypeKeys.has(typeKey);
                const label = document.createElement('label');
                label.innerHTML = `<input type="checkbox" class="filter-checkbox" value="${typeKey}" ${isChecked ? 'checked' : ''}> <img src="${markerType.icon.options.iconUrl}" width="12" style="margin-right: 5px;"> ${markerType.name}`;
                container.appendChild(label);
            }
        });

        // Gắn sự kiện cho các checkbox loại
        container.querySelectorAll('input').forEach(cb => cb.addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedTypeKeys.add(e.target.value);
            } else {
                selectedTypeKeys.delete(e.target.value);
            }
            updateSelectAllState('types');
            masterFilter();
        }));
        updateSelectAllState('types');
    }

    // 3. HÀM CẬP NHẬT GIAO DIỆN BỘ LỌC NGƯỜI DÙNG
    function populateUserFilter() {
        const container = document.getElementById('user-filter-list');
        container.innerHTML = '';
        const userSearchTerm = document.getElementById('user-search-input').value.toLowerCase();
        
        const owners = [...new Set(allMarkersData.map(m => m.Owner).filter(Boolean))];

        owners.forEach(owner => {
            if (owner.toLowerCase().includes(userSearchTerm)) {
                // Đọc trạng thái từ biến toàn cục
                const isChecked = selectedUserOwners.has(owner);
                const label = document.createElement('label');
                label.innerHTML = `<input type="checkbox" class="filter-checkbox" value="${owner}" ${isChecked ? 'checked' : ''}> ${owner}`;
                container.appendChild(label);
            }
        });  
        
        container.querySelectorAll('input').forEach(cb => cb.addEventListener('change', (e) => {
            // Cập nhật trạng thái vào biến toàn cục
            if (e.target.checked) {
                selectedUserOwners.add(e.target.value);
            } else {
                selectedUserOwners.delete(e.target.value);
            }
            updateSelectAllState('users');
            masterFilter();
        }));
        updateSelectAllState('users');
    }

    // 4. HÀM CẬP NHẬT TRẠNG THÁI NÚT "CHỌN TẤT CẢ"
    function updateSelectAllState(category) {
        let selectAllCheckbox, totalCount, selectedCount, header, headerIcon, headerText;

        if (category === 'types') {
            selectAllCheckbox = document.getElementById('type-select-all');
            header = document.getElementById('type-filter-header');
            headerIcon = 'fa-solid fa-filter';
            headerText = 'Lọc loại địa điểm';
            totalCount = Object.keys(markerTypes).length;
            selectedCount = selectedTypeKeys.size;
        } else if (category === 'users') {
            selectAllCheckbox = document.getElementById('user-select-all');
            header = document.getElementById('user-filter-header');
            headerIcon = 'fa-solid fa-users';
            headerText = 'Lọc theo người tạo';
            totalCount = [...new Set(allMarkersData.map(m => m.Owner).filter(Boolean))].length;
            selectedCount = selectedUserOwners.size;
        } else {
            return;
        }
        
        // Cập nhật tiêu đề với số lượng đã chọn
        if (header) {
            header.innerHTML = `<i class="${headerIcon}"></i> ${headerText} (${selectedCount}/${totalCount})`;
        }

        // Cập nhật trạng thái checkbox "Chọn tất cả"
        if (selectedCount === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (selectedCount === totalCount && totalCount > 0) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        }
    }

    // 5. GẮN SỰ KIỆN BAN ĐẦU CHO CÁC BỘ LỌC
    function setupFilterEventListeners() {
        // Sự kiện cho bộ lọc LOẠI GHIM
        document.getElementById('type-search-input').addEventListener('input', () => {
            populateTypeFilter(); // Cập nhật danh sách checkbox lọc
            populateTypeManager(); // Cập nhật luôn danh sách quản lý
        });
        document.getElementById('type-select-all').addEventListener('change', (e) => {
            const allOwners = new Set(Object.keys(markerTypes));
            if (e.target.checked) {
                selectedTypeKeys = allOwners;
            } else {
                selectedTypeKeys.clear();
            }
            populateTypeFilter();
            masterFilter();

        });

        // Sự kiện cho bộ lọc NGƯỜI DÙNG
        const userFilterContainer = document.getElementById('user-filter-container');
        if (userFilterContainer) {
            document.getElementById('user-search-input').addEventListener('input', populateUserFilter);
            document.getElementById('user-select-all').addEventListener('change', (e) => {
                const allOwners = new Set(allMarkersData.map(m => m.Owner).filter(Boolean));
                if (e.target.checked) {
                    selectedUserOwners = allOwners;
                } else {
                    selectedUserOwners.clear();
                }
                populateUserFilter();
                masterFilter();
            });
        }
    }

    // 6. SỬA LẠI HÀM CẬP NHẬT GIAO DIỆN TỔNG
    function updateUI() {
        // 1. Cập nhật giao diện bộ lọc loại ghim
        populateTypeFilter();

        // 2. Cập nhật và hiển thị bộ lọc người dùng (chỉ cho Admin)
        const userFilterContainer = document.getElementById('user-filter-container');
        if (userFilterContainer) {
            if (currentUser && currentUser.Role === 'Admin' && allMarkersData.length > 0) {
                userFilterContainer.style.display = 'block';
                if (userFilterContainer.nextElementSibling.tagName === 'HR') {
                    userFilterContainer.nextElementSibling.style.display = 'block';
                }
                populateUserFilter();
            } else {
                userFilterContainer.style.display = 'none';
                if (userFilterContainer.nextElementSibling.tagName === 'HR') {
                    userFilterContainer.nextElementSibling.style.display = 'none';
                }
            }
        }

        // 3. Cập nhật giao diện quản lý loại (chỉ cho Admin)
        populateTypeManager();

        // 4. Áp dụng tất cả các bộ lọc và cập nhật bản đồ + danh sách ghim
        masterFilter();
    }

    // --- CHỨC NĂNG LƯU / TẢI GHIM ---
// Thay thế hoàn toàn hàm loadMarkers cũ bằng hàm này
async function loadMarkers() {
    const mapBlockerMessage = document.getElementById('map-blocker-message');
    try {
        // --- BƯỚC 1: TẢI TYPES (KHÔNG THAY ĐỔI) ---
        mapBlockerMessage.textContent = 'Đang tải cấu hình...';
        const typesRes = await fetch(`${GOOGLE_SHEET_API_URL}?action=getTypes&t=${new Date().getTime()}`);
        if (!typesRes.ok) throw new Error('Không thể tải dữ liệu loại ghim.');
        const typesData = await typesRes.json();
        markerTypes = {};
        typesData.forEach(type => {
            markerTypes[type.key + ""] = {
                name: type.name + "",
                icon: new MarkerIcon({ iconUrl: type.iconUrl })
            };
        });

        // --- BƯỚC 2: KIỂM TRA PHIÊN BẢN VÀ TẢI GHIM THÔNG MINH ---
        mapBlockerMessage.textContent = 'Đang kiểm tra dữ liệu ghim...';
        
        // Lấy phiên bản mới nhất từ server
        const versionRes = await fetch(`${GOOGLE_SHEET_API_URL}?action=getMarkersVersion&t=${new Date().getTime()}`);
        if (!versionRes.ok) throw new Error('Không thể kiểm tra phiên bản dữ liệu.');
        const serverVersionData = await versionRes.json();
        const serverVersion = serverVersionData.version;

        // Lấy dữ liệu cache và trạng thái tải lần trước
        let cachedData = JSON.parse(localStorage.getItem(MARKER_CACHE_KEY)) || { markers: [], version: null, status: 'new', total: 0 };
        
        let initialOffset = 0;
        allMarkersData = [];

        // Kịch bản 1: Cache đã đầy đủ và mới nhất -> Dùng cache
        if (cachedData.status === 'complete' && cachedData.version === serverVersion) {
            allMarkersData = cachedData.markers;
            mapBlockerMessage.textContent = `Đã tải ${allMarkersData.length} ghim từ bộ đệm.`;
            console.log("Sử dụng dữ liệu ghim từ cache. Phiên bản: " + serverVersion);
        
        // Kịch bản 2: Cache đang tải dở dang và cùng phiên bản -> Tải tiếp
        } else if (cachedData.status === 'incomplete' && cachedData.version === serverVersion) {
            allMarkersData = cachedData.markers;
            initialOffset = allMarkersData.length;
            const remaining = cachedData.total - initialOffset;
            mapBlockerMessage.textContent = `Phát hiện tải chưa hoàn tất. Tải tiếp ${remaining} ghim còn lại...`;
            console.log(`Tiếp tục tải từ ghim thứ ${initialOffset}.`);
        
        // Kịch bản 3: Cache cũ hoặc không có -> Tải mới từ đầu
        } else {
            mapBlockerMessage.textContent = 'Phát hiện dữ liệu mới, bắt đầu tải...';
            console.log(`Phiên bản cache (${cachedData.version}) khác server (${serverVersion}). Bắt đầu tải mới.`);
        }

        // Vòng lặp tải chỉ chạy khi dữ liệu chưa đầy đủ
        if (allMarkersData.length === 0 || initialOffset > 0) {
            let offset = initialOffset;
            const limit = 100;
            let total = cachedData.total || 0;

            try {
                while (true) {
                    const markersRes = await fetch(`${GOOGLE_SHEET_API_URL}?action=getMarkers&offset=${offset}&limit=${limit}&t=${new Date().getTime()}`);
                    if (!markersRes.ok) throw new Error(`Lỗi tải ghim ở vị trí ${offset}.`);
                    
                    const chunkData = await markersRes.json();
                    
                    if (total === 0) total = chunkData.total;
                    if (total === 0 || !chunkData.markers || chunkData.markers.length === 0) break;
                    
                    allMarkersData.push(...chunkData.markers);
                    mapBlockerMessage.textContent = `Đang tải ${allMarkersData.length}/${total} ghim...`;

                    // Lưu tiến trình dở dang sau mỗi lần tải thành công 1 chunk
                    localStorage.setItem(MARKER_CACHE_KEY, JSON.stringify({
                        version: serverVersion,
                        markers: allMarkersData,
                        total: total,
                        status: 'incomplete' // Đánh dấu là đang tải dở
                    }));

                    offset += chunkData.markers.length;
                    if (allMarkersData.length >= total) break;
                }

                // Khi vòng lặp kết thúc thành công, đánh dấu là đã hoàn tất
                localStorage.setItem(MARKER_CACHE_KEY, JSON.stringify({
                    version: serverVersion,
                    markers: allMarkersData,
                    total: total,
                    status: 'complete' 
                }));
                console.log("Đã tải xong và cập nhật cache với phiên bản mới.");

            } catch (error) {
                // Nếu có lỗi giữa chừng, dữ liệu dở dang đã được lưu
                console.error(error.message);
                const missingCount = total - allMarkersData.length;
                mapBlockerMessage.textContent = `Tải không hoàn thành! Dữ liệu có thể không đầy đủ (thiếu ${missingCount} ghim). Vui lòng kiểm tra mạng và tải lại trang.`;
                // Không return, vẫn tiếp tục hiển thị dữ liệu đã có
            }
        }
        
        // --- CÁC BƯỚC CÒN LẠI GIỮ NGUYÊN ---
        // Xử lý và chuẩn hóa dữ liệu
        allMarkersData = allMarkersData.map(marker => ({
            ...marker,
            name: String(marker.name || ''),
            desc: String(marker.desc || ''),
            type: String(marker.type || ''),
            lat: parseFloat(marker.lat),
            lng: parseFloat(marker.lng)
        }));

        // Khởi tạo bộ lọc, timeline và bản đồ
        selectedTypeKeys = new Set(Object.keys(markerTypes));
        selectedUserOwners = new Set(allMarkersData.map(m => m.Owner).filter(Boolean));
        populateTypeFilter();
        populateUserFilter();
        setupTimelineSlider();
        masterFilter();

        const mapControls = document.getElementById('map-controls');
        if (mapControls) mapControls.style.display = 'block';
        if (toggleBtn) toggleBtn.style.display = 'block';
        
        // Chỉ ẩn thông báo thành công, giữ lại thông báo lỗi
        if (!mapBlockerMessage.textContent.startsWith('Tải lỗi')) {
             setTimeout(() => { mapBlockerMessage.textContent = ''; }, 2000);
        }

    } catch (error) {
        console.error(error.message);
        mapBlockerMessage.textContent = `Lỗi: ${error.message}`;
    }
}

    // Hàm mới để tải các loại ghim mặc định khi cần
    // function loadDefaultMarkerTypes() {
    //     markerTypes = {
    //         'doi_tuong': { name: 'Đối tượng', icon: new MarkerIcon({ iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png' }) },
    //         'dia_diem': { name: 'Địa điểm', icon: new MarkerIcon({ iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png' }) },
    //         'ket_noi': { name: 'Kết nối', icon: new MarkerIcon({ iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png' }) },
    //         'su_kien': { name: 'Sự kiện', icon: new MarkerIcon({ iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png' }) },
    //         'nhiem_vu': { name: 'Nhiệm vụ', icon: new MarkerIcon({ iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-black.png' }) }
    //     };
    // }

    async function saveMarkers() {
        // Chức năng này hiện không còn an toàn trong môi trường nhiều người dùng.
        // Thay vào đó, mỗi hành động (Thêm, Sửa, Xóa) sẽ tự động lưu.
        // Nếu bạn vẫn muốn giữ nút này, nó chỉ nên lưu các thay đổi của riêng bạn.
        // Tạm thời vô hiệu hóa bằng một cảnh báo.
        alert("Chức năng này đã được thay thế bằng việc lưu tự động cho mỗi hành động (Thêm/Sửa/Xóa ghim).");
        return;
    }
    async function saveTypes() {
        if (!currentUser || currentUser.Role !== 'Admin') {
            console.log("Hành động lưu loại ghim bị bỏ qua do không có quyền Admin.");
            return;
        }

        // Chuyển đổi đối tượng markerTypes thành một mảng để gửi đi
        const typesToSave = Object.keys(markerTypes).map(key => ({
            key: key,
            name: markerTypes[key].name,
            iconUrl: markerTypes[key].icon.options.iconUrl
        }));

        try {
            const response = await fetch(GOOGLE_SHEET_API_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'saveTypes', types: typesToSave })
            });
            const result = await response.json();
            if (result.success) {
                console.log("Lưu các loại ghim thành công.");
            } else {
                console.error("Lỗi từ server khi lưu loại ghim:", result.message);
            }
        } catch (error) {
            console.error('Lỗi khi gửi yêu cầu lưu các loại ghim:', error);
        }
    }
    // --- SỰ KIỆN CLICK VÀ THÊM GHIM MỚI ---
    let tempMarker;
    map.on('click', function (e) {
        // Thêm điều kiện kiểm tra: Chỉ chạy khi không có popup nào đang mở
        if (isDrawing) {
            return; 
        }
        if (!isPopupOpen) {
            openAddMarkerPopup(e.latlng.lat, e.latlng.lng);
        }
    });
    map.on('draw:drawstart', function (e) {
        isDrawing = true;
        // console.log("Bắt đầu vẽ, chức năng ghim tạm tắt.");
    });

    // Tắt cờ khi người dùng hoàn thành hoặc hủy bỏ việc vẽ
    map.on('draw:drawstop', function (e) {
        isDrawing = false;
        // console.log("Kết thúc vẽ, chức năng ghim được bật lại.");
    });
    // TÁCH HÀM MỞ POPUP ĐỂ TÁI SỬ DỤNG
    function openAddMarkerPopup(lat, lng) {
        // THÊM ĐOẠN KIỂM TRA QUYỀN NÀY
        if (!currentUser || (currentUser.Role !== 'Admin' && currentUser.Role !== 'Editor' && currentUser.Role !== 'Viewer')) {
            alert("Bạn không có quyền thêm ghim.");
            return;
        }
        // --- PHẦN MỚI: KIỂM TRA TỌA ĐỘ TRÙNG LẶP ---
        const tolerance = 0.00001; // Ngưỡng sai số để coi là trùng
        const existingMarker = allMarkersData.find(marker => 
            Math.abs(marker.lat - lat) < tolerance && 
            Math.abs(marker.lng - lng) < tolerance
        );

        if (existingMarker) {
            // Nếu tìm thấy ghim đã có, cảnh báo và bay tới đó
            alert(`Tọa độ này đã tồn tại với tên: "${existingMarker.name}".`);
            flyToMarker(existingMarker.id);
            if (tempMarker) {
                map.removeLayer(tempMarker); // Xóa ghim tạm thời nếu có
                tempMarker = null;
            }
            return; // Dừng hàm, không mở popup thêm mới
        }
        // --- KẾT THÚC PHẦN KIỂM TRA ---


        // Nếu không trùng, tiếp tục như bình thường
        if (tempMarker) map.removeLayer(tempMarker);
        tempMarker = L.marker([lat, lng]).addTo(map);

        let typeOptions = '';
        Object.keys(markerTypes).forEach(key => {
            typeOptions += `<option value="${key}">${markerTypes[key].name}</option>`;
        });

        const formContent = `
            <div class="add-location-form">
                <h4>Thêm địa điểm mới</h4>
                <p class="popup-coords">Tọa độ: ${lat.toFixed(5)}, ${lng.toFixed(5)}</p>
                <input type="text" id="add-markerName" placeholder="Tên địa điểm" class="form-control" required>
                <textarea id="add-markerDesc" placeholder="Mô tả" class="form-control" rows="2"></textarea>
                <input type="url" id="add-markerLink" placeholder="Dán liên kết (ví dụ: https://...)" class="form-control">
                <label for="add-markerInclusionDate" style="font-size: 14px; margin-top: 5px; display:block;">Ngày đưa vào diện:</label>
                <input type="date" id="add-markerInclusionDate" class="form-control">
                <select id="add-markerType" class="form-control" style="margin-top: 12px;">${typeOptions}</select>
                <button onclick="addMarker(${lat}, ${lng})" class="btn-submit-marker">Lưu Ghim</button>
            </div>`;
        tempMarker.bindPopup(formContent).openPopup();
    }

    function addMarkerFromInput() {
        const coordsInput = document.getElementById('coords-input');
        const coordsString = coordsInput.value.trim();
        if (!coordsString) {
            alert('Vui lòng nhập tọa độ.');
            return;
        }
        
        const coordsRegex = /^(-?\d{1,3}(\.\d+)?),\s*(-?\d{1,3}(\.\d+)?)$/;
        const match = coordsString.match(coordsRegex);

        if (!match) {
            alert('Định dạng tọa độ không hợp lệ. Ví dụ: 10.38957, 105.62563');
            return;
        }

        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[3]);

        if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            alert('Giá trị vĩ độ hoặc kinh độ không hợp lệ.');
            return;
        }
        
        // Tái sử dụng hàm mở popup
        openAddMarkerPopup(lat, lng);
        map.flyTo([lat, lng], 17); // Bay đến vị trí mới
        coordsInput.value = ''; // Xóa ô nhập
    }
    // --- CÁC HÀM HÀNH ĐỘNG (Gán vào window để HTML gọi được) ---
    window.addMarker = async function(lat, lng) {
        if (!currentUser || (currentUser.Role !== 'Admin' && currentUser.Role !== 'Editor' && currentUser.Role !== 'Viewer')) {
            alert("Bạn không có quyền thêm ghim.");
            return;
        }
        const newMarkerData = {
            id: Date.now(), lat, lng,
            name: document.getElementById('add-markerName').value || 'Địa điểm không tên',
            desc: document.getElementById('add-markerDesc').value || '',
            linkUrl: document.getElementById('add-markerLink').value || '',
            inclusionDate: document.getElementById('add-markerInclusionDate').value,
            type: document.getElementById('add-markerType').value,
            Owner: currentUser.Username
        };
        allMarkersData.push(newMarkerData);
        if (tempMarker) map.removeLayer(tempMarker);
        renderMarker(newMarkerData);
        selectedUserOwners.add(newMarkerData.Owner);
        updateUI();
        setupTimelineSlider();
        map.closePopup();

        // Gửi yêu cầu thêm ghim mới lên Google Sheet
        try {
            // THÊM headers VÀO YÊU CẦU FETCH
            const response = await fetch(GOOGLE_SHEET_API_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'addMarker', marker: newMarkerData })
            });
            // Không cần xử lý response ở đây vì ta đã xử lý ngay trên UI
        } catch (error) {
            console.error('Lỗi khi thêm ghim mới:', error);
        }
    };

    window.flyToMarker = function(markerId) {
        // KIỂM TRA ĐẢM BẢO BẢN ĐỒ VÀ CÁC THÀNH PHẦN KHÁC ĐÃ SẴN SÀNG
        if (!map || !markerLayerGroup || !allMarkersData.length) {
            console.warn("Bản đồ hoặc dữ liệu chưa sẵn sàng, thử lại sau...");
            setTimeout(() => window.flyToMarker(markerId), 100);
            return;
        }
        
        let targetLayer = null;
        // Dùng getLayers() để tìm trong TẤT CẢ các ghim, kể cả khi đang bị gom cụm
        const allManagedLayers = markerLayerGroup.getLayers();
        for (let i = 0; i < allManagedLayers.length; i++) {
            if (allManagedLayers[i].markerData && allManagedLayers[i].markerData.id === markerId) {
                targetLayer = allManagedLayers[i];
                break;
            }
        }

        if (targetLayer) {
            // Sử dụng phương thức đặc biệt của MarkerCluster để đảm bảo ghim được hiển thị
            markerLayerGroup.zoomToShowLayer(targetLayer, function () {
                // Sau khi zoom và tách cụm xong (nếu cần), thì mở popup
                targetLayer.openPopup();
            });
        } else {
            // Nếu không tìm thấy ghim trên bản đồ (có thể do bị lọc)
            // Tìm dữ liệu thô và bay tới tọa độ của nó
            const markerData = allMarkersData.find(m => m.id === markerId);
            if (markerData) {
                map.flyTo([markerData.lat, markerData.lng], 16);
            } else {
                console.error("Không tìm thấy ghim để bay tới.");
            }
        }
    };

    window.copyCoords = function(lat, lng) {
        const text = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        navigator.clipboard.writeText(text).then(() => {
            alert('Đã sao chép tọa độ: ' + text);
        });
    }
    window.openEditMarkerPopup = function(markerId) {
        // KIỂM TRA TƯƠNG TỰ ĐỂ ĐẢM BẢO BẢN ĐỒ ĐÃ SẴN SÀNG
        if (!map || !markerLayerGroup || !allMarkersData.length) {
            console.warn("Bản đồ hoặc dữ liệu chưa sẵn sàng, thử lại sau...");
            setTimeout(() => window.openEditMarkerPopup(markerId), 100);
            return;
        }
        
        const markerData = allMarkersData.find(m => m.id === markerId);
        if (!markerData) {
            console.error("Không tìm thấy dữ liệu ghim với ID:", markerId);
            return;
        }

        // --- KIỂM TRA ĐẢM BẢO QUYỀN SỬA ---
        if (!currentUser || (currentUser.Role === 'Viewer' && markerData.Owner !== currentUser.Username) || (currentUser.Role === 'Editor' && markerData.Owner !== currentUser.Username)) {
            alert("Bạn không có quyền sửa ghim này.");
            return;
        }
        
        let targetLayer = null;
        // Tìm layer tương ứng với markerId
        markerLayerGroup.eachLayer(layer => {
            if (layer.markerData && layer.markerData.id === markerId) {
                targetLayer = layer;
                return; // Dừng vòng lặp sau khi tìm thấy
            }
        });

        // --- KIỂM TRA LAYER VÀ VỊ TRÍ ---
        if (!targetLayer) {
            console.warn("Không tìm thấy layer trực tiếp, di chuyển đến vị trí ghim...");
            map.flyTo([markerData.lat, markerData.lng], 17, {
                duration: 1
            }).once('moveend', () => { // Khi di chuyển xong, tìm và mở popup
                const allLayers = markerLayerGroup.getLayers();
                for (const layer of allLayers) {
                    if (layer.markerData && layer.markerData.id === markerId) {
                        targetLayer = layer;
                        break;
                    }
                }
                if (targetLayer) {
                    targetLayer.openPopup();
                } else {
                    console.error("Lỗi: Không thể tìm thấy layer sau khi di chuyển.");
                }
            });
            return;
        }

        // --- TẠO NỘI DUNG POPUP ---
        let typeOptions = '';
        Object.keys(markerTypes).forEach(key => {
            const selected = key === markerData.type ? 'selected' : '';
            typeOptions += `<option value="${key}" ${selected}>${markerTypes[key].name}</option>`;
        });

        const currentName = markerData.name || '';
        const currentDesc = markerData.desc || '';
        // console.log("Inclusion Date:", markerData.inclusionDate);
        const inclusionDateValue = markerData.inclusionDate ? correctUTCToLocalDay(markerData.inclusionDate): '';
        const currentLink = markerData.linkUrl || '';

        const formContent = `
            <div class="add-location-form">
                <h4>Chỉnh sửa địa điểm</h4>
                <p class="popup-coords">Tọa độ: ${markerData.lat.toFixed(5)}, ${markerData.lng.toFixed(5)}</p>
                <input type="text" id="markerName-${markerData.id}" placeholder="Tên địa điểm" class="form-control" value="${currentName}" required>
                <textarea id="markerDesc-${markerData.id}" placeholder="Mô tả" class="form-control" rows="2">${currentDesc}</textarea>
                <input type="url" id="markerLink-${markerData.id}" placeholder="Dán liên kết (ví dụ: https://...)" class="form-control" value="${currentLink}">
                <label for="markerInclusionDate-${markerData.id}" style="font-size: 14px; margin-top: 5px; display:block;">Ngày đưa vào diện:</label>
                <input type="date" id="markerInclusionDate-${markerData.id}" class="form-control" value="${inclusionDateValue}">
                <select id="markerType-${markerData.id}" class="form-control" style="margin-top: 12px;">${typeOptions}</select>
                <button onclick="saveMarkerChanges(${markerData.id})" class="btn-submit-marker">Lưu thay đổi</button>
            </div>`;
        
        targetLayer.setPopupContent(formContent).openPopup();
    };

    window.saveMarkerChanges = async function(markerId, contextNode = document) {
        const markerIndex = allMarkersData.findIndex(m => m.id === markerId);
        if (markerIndex === -1) return;
        const markerToEdit = allMarkersData[markerIndex];

        if (!currentUser || (currentUser.Role === 'Viewer' && markerToEdit.Owner !== currentUser.Username) || (currentUser.Role === 'Editor' && markerToEdit.Owner !== currentUser.Username)) {
            alert("Bạn không có quyền sửa ghim này.");
            return;
        }
        
        const updatedData = {
            name: contextNode.querySelector(`#markerName-${markerId}`).value || 'Địa điểm không tên',
            desc: contextNode.querySelector(`#markerDesc-${markerId}`).value || '',
            linkUrl: contextNode.querySelector(`#markerLink-${markerId}`).value || '',
            inclusionDate: contextNode.querySelector(`#markerInclusionDate-${markerId}`).value,
            type: contextNode.querySelector(`#markerType-${markerId}`).value
        };
        const finalMarkerData = { ...markerToEdit, ...updatedData };
        allMarkersData[markerIndex] = finalMarkerData;
        
        // 1. Đóng popup ngay lập tức
        map.closePopup();
        
        // 2. SỬA LỖI: Dùng setTimeout để đảm bảo popup đã đóng hoàn toàn trước khi thao tác
        setTimeout(async () => {
            let layerToRemove = null;
            // Dùng vòng lặp for...of để có thể break sớm, hiệu quả hơn
            for (const layer of markerLayerGroup.getLayers()) {
                if (layer.markerData && layer.markerData.id == markerId) {
                    layerToRemove = layer;
                    break;
                }
            }
            
            // 3. Xóa ghim cũ (bây giờ sẽ thành công)
            if (layerToRemove) {
                markerLayerGroup.removeLayer(layerToRemove);
            }
            
            // 4. Vẽ lại ghim mới với dữ liệu đã cập nhật
            renderMarker(allMarkersData[markerIndex]); 
            
            updateUI();
            setupTimelineSlider();
            // 5. Gửi yêu cầu cập nhật lên Google Sheet
            try {
                // THÊM headers VÀO YÊU CẦU FETCH
                await fetch(GOOGLE_SHEET_API_URL, {
                    method: 'POST',
                    // headers: {
                    //     'Content-Type': 'application/json',
                    // },
                    body: JSON.stringify({ action: 'updateMarker', marker: finalMarkerData })
                });
            } catch (error) {
                console.error('Lỗi khi cập nhật ghim:', error);
            }
        }, 0); // Trì hoãn 0ms là đủ để đợi chu trình sự kiện tiếp theo
    };
    // --- CẬP NHẬT GIAO DIỆN ---
    function updateUI() {
        populateTypeFilter(); // Sửa tên hàm ở đây
        populateUserFilter(); // Thêm hàm này để cập nhật bộ lọc user
        populateTypeManager();
        masterFilter(); // Hàm này sẽ gọi populatePinnedList với dữ liệu đúng
    }

    // // --- GẮN CÁC SỰ KIỆN BAN ĐẦU ---
    // document.getElementById('toggle-btn').addEventListener('click', () => {
    //     const sidebar = document.getElementById('sidebar');
    //     const toggleBtn = document.getElementById('toggle-btn');
    //     const icon = toggleBtn.querySelector('i');

    //     // Toggle các class cho sidebar và nút
    //     sidebar.classList.toggle('open');
    //     toggleBtn.classList.toggle('shifted');

    //     // Kiểm tra và thay đổi biểu tượng
    //     if (sidebar.classList.contains('open')) {
    //         icon.classList.remove('fa-bars');
    //         icon.classList.add('fa-xmark');
    //     } else {
    //         icon.classList.remove('fa-xmark');
    //         icon.classList.add('fa-bars');
    //     }
    // });
    
    document.getElementById('save-btn').addEventListener('click', saveMarkers);
    document.getElementById('add-by-coords-btn').addEventListener('click', addMarkerFromInput);
    // document.getElementById('save-view-btn').addEventListener('click', () => {
    //     const center = map.getCenter();
    //     const zoom = map.getZoom();
    //     const view = { lat: center.lat, lng: center.lng, zoom: zoom };
    //     localStorage.setItem('mapInitialView', JSON.stringify(view));
    //     document.getElementById('initial-view-input').value = `Zoom ${view.zoom} - (${view.lat.toFixed(4)}, ${view.lng.toFixed(4)})`;
    //     alert('Đã lưu vị trí khởi tạo!');
    // });

    // document.getElementById('add-type-btn').addEventListener('click', () => {
    //     const name = document.getElementById('new-type-name').value;
    //     const iconUrl = document.getElementById('selected-icon-url').value;
    //     addNewMarkerType(name, iconUrl);
    //     document.getElementById('new-type-name').value = '';
    // });

    const iconSelector = document.getElementById('icon-selector');
    availableIcons.forEach((url, index) => {
        const img = document.createElement('img');
        img.src = url;
        img.addEventListener('click', () => {
            document.querySelectorAll('#icon-selector img').forEach(i => i.classList.remove('selected'));
            img.classList.add('selected');
            document.getElementById('selected-icon-url').value = url;
        });
        if (index === 0) {
            img.classList.add('selected');
            document.getElementById('selected-icon-url').value = url;
        }
        iconSelector.appendChild(img);
    });
    
    // --- KHỞI CHẠY ỨNG DỤNG ---
    async function initializeApp() {
        // 1. Tải danh sách tài khoản và kiểm tra phiên đăng nhập đã lưu
        // await fetchAccounts();
        checkSession();
        setupFilterEventListeners();
        // Gắn sự kiện cho nút bật/tắt thanh trượt thời gian
        const toggleTimelineBtn = document.getElementById('toggle-timeline-btn');
        const timelineContainer = document.getElementById('timeline-container');

        toggleTimelineBtn.addEventListener('click', () => {
            const isVisible = timelineContainer.classList.toggle('visible');
            toggleTimelineBtn.classList.toggle('active', isVisible);
            // Nếu người dùng vừa tắt thanh trượt
            if (!isVisible) {
                // SỬA LỖI: Thêm điều kiện kiểm tra timelineMaxDate có tồn tại không
                if (timelineMaxDate) {
                    // Reset bộ lọc ngày về trạng thái ban đầu (hiển thị tất cả)
                    selectedTimelineEndDate = timelineMaxDate;
                    document.getElementById('timeline-slider').value = timelineMaxDate.getTime();
                    updateTimelineLabels();
                    masterFilter(); // Áp dụng lại bộ lọc để hiển thị lại tất cả ghim
                }
            }
        });
        // 2. Tải dữ liệu ghim
        // await loadMarkers(); // Dòng này được gọi bên trong checkSession() hoặc handleLogin() nên không cần ở đây
            // Quản lý nút Heatmap
        const heatmapBtn = document.getElementById('toggle-heatmap-btn');
        if (heatmapBtn) {
            heatmapBtn.addEventListener('click', () => {
                isHeatmapMode = !isHeatmapMode;
                if (isHeatmapMode) {
                    // heatmapBtn.textContent = 'Tắt Bản đồ Nhiệt';
                    heatmapBtn.style.backgroundColor = '#28a745';

                    // Tắt chế độ phân tích nếu đang bật
                    if (isAnalysisMode) {
                        isAnalysisMode = false;
                        epsilonContainer.classList.toggle('active', isAnalysisMode);
                        const analysisBtn = document.getElementById('toggle-analysis-btn');
                        const resultsContainer = document.getElementById('analysis-results-container');
                        analysisBtn.textContent = 'Bật Phân Tích';
                        analysisBtn.style.backgroundColor = '#28a745';
                        resultsContainer.style.display = 'none';
                        clearAnalysisResults();
                    }
                } else {
                    // heatmapBtn.textContent = 'Bật Bản đồ Nhiệt';
                    heatmapBtn.style.backgroundColor = '#dc3545';
                }
                masterFilter();
            });
        }
        // 3. Gắn sự kiện cho các nút Đăng nhập / Đăng xuất
        function togglePopup() {
            document.getElementById('login-popup').classList.toggle('show');
        }
        document.getElementById('auth-toggle-btn').addEventListener('click', () => {
            document.getElementById('login-popup').classList.toggle('show');
        });
        document.getElementById('login-btn').addEventListener('click', () => {
            handleLogin(loginUsernameInput.value.trim(), loginPasswordInput.value.trim());
        });
        document.getElementById('logout-btn').addEventListener('click', handleLogout);
        
        // 4. BỔ SUNG LẠI: Gắn sự kiện cho nút Mở/Đóng Bảng điều khiển (Sidebar)
        document.getElementById('toggle-btn').addEventListener('click', () => {
            const sidebar = document.getElementById('sidebar');
            const toggleBtn = document.getElementById('toggle-btn');
            const icon = toggleBtn.querySelector('i');

            sidebar.classList.toggle('open');
            // toggleBtn.classList.toggle('shifted');

            if (sidebar.classList.contains('open')) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-xmark');
            } else {
                icon.classList.remove('fa-xmark');
                icon.classList.add('fa-bars');
            }
        });

        // 5. Gắn sự kiện cho các nút chức năng chính trong Sidebar
        document.getElementById('save-btn').addEventListener('click', saveMarkers);
        document.getElementById('add-by-coords-btn').addEventListener('click', addMarkerFromInput);
        
        document.getElementById('save-view-btn').addEventListener('click', () => {
            const center = map.getCenter();
            const zoom = map.getZoom();
            const view = { lat: center.lat, lng: center.lng, zoom: zoom };
            localStorage.setItem('mapInitialView', JSON.stringify(view));
            document.getElementById('initial-view-input').value = `Zoom ${view.zoom} - (${view.lat.toFixed(4)}, ${view.lng.toFixed(4)})`;
            alert('Đã lưu vị trí khởi tạo!');
        });

        document.getElementById('add-type-btn').addEventListener('click', () => {
            const name = document.getElementById('new-type-name').value;
            const iconUrl = document.getElementById('selected-icon-url').value;
            addNewMarkerType(name, iconUrl);
            document.getElementById('new-type-name').value = '';
        });

        // 6. Tạo và gắn sự kiện cho ô tìm kiếm
        const pinnedListContainer = document.getElementById('pinned-list-search');
        if (!document.getElementById('search-pinned')) {
            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.id = 'search-pinned';
            searchInput.placeholder = 'Tìm kiếm địa điểm đã ghim...';
            pinnedListContainer.insertBefore(searchInput, pinnedListContainer.firstChild.nextSibling);
            searchInput.addEventListener('input', masterFilter);
        }
        
        // 7. Hiển thị thông tin vị trí ban đầu
        document.getElementById('initial-view-input').value = `Zoom ${initialView.zoom} - (${initialView.lat.toFixed(4)}, ${initialView.lng.toFixed(4)})`;
    }

    // 1. Việt hóa các chuỗi văn bản của Leaflet.draw
    L.drawLocal.draw.toolbar.actions.title = 'Hủy vẽ';
    L.drawLocal.draw.toolbar.actions.text = 'Hủy';
    L.drawLocal.draw.toolbar.finish.title = 'Hoàn thành vẽ';
    L.drawLocal.draw.toolbar.finish.text = 'Hoàn thành';
    L.drawLocal.draw.toolbar.undo.title = 'Xóa điểm cuối cùng';
    L.drawLocal.draw.toolbar.undo.text = 'Xóa điểm cuối';
    L.drawLocal.draw.toolbar.buttons.polygon = 'Vẽ một đa giác';
    L.drawLocal.draw.toolbar.buttons.polyline = 'Vẽ một đường thẳng';
    L.drawLocal.draw.toolbar.buttons.rectangle = 'Vẽ một hình chữ nhật';
    L.drawLocal.draw.toolbar.buttons.circle = 'Vẽ một vòng tròn';
    L.drawLocal.draw.toolbar.buttons.marker = 'Đặt một điểm ghim';

    L.drawLocal.draw.handlers.circle.tooltip.start = 'Click và kéo để vẽ vòng tròn.';
    L.drawLocal.draw.handlers.polygon.tooltip.start = 'Click để bắt đầu vẽ hình.';
    L.drawLocal.draw.handlers.polygon.tooltip.cont = 'Click để tiếp tục vẽ hình.';
    L.drawLocal.draw.handlers.polygon.tooltip.end = 'Click điểm đầu tiên để kết thúc.';
    L.drawLocal.draw.handlers.polyline.tooltip.start = 'Click để bắt đầu vẽ đường.';
    L.drawLocal.draw.handlers.polyline.tooltip.cont = 'Click để tiếp tục vẽ đường.';
    L.drawLocal.draw.handlers.polyline.tooltip.end = 'Click điểm cuối để hoàn thành.';

    L.drawLocal.edit.toolbar.actions.save.title = 'Lưu thay đổi.';
    L.drawLocal.edit.toolbar.actions.save.text = 'Lưu';
    L.drawLocal.edit.toolbar.actions.cancel.title = 'Hủy chỉnh sửa, loại bỏ mọi thay đổi.';
    L.drawLocal.edit.toolbar.actions.cancel.text = 'Hủy';
    L.drawLocal.edit.toolbar.actions.clearAll.title = 'Xóa tất cả các lớp.';
    L.drawLocal.edit.toolbar.actions.clearAll.text = 'Xóa tất cả';

    L.drawLocal.edit.toolbar.buttons.edit = 'Chỉnh sửa các lớp.';
    L.drawLocal.edit.toolbar.buttons.editDisabled = 'Không có lớp nào để chỉnh sửa.';
    L.drawLocal.edit.toolbar.buttons.remove = 'Xóa các lớp.';
    L.drawLocal.edit.toolbar.buttons.removeDisabled = 'Không có lớp nào để xóa.';

        // START: Added Geolocation Logic for Map Buttons
        let locationMarker = null;
        let wasPinAction = false; // Flag to check if the pin button was clicked

        document.getElementById('find-me-btn-map').addEventListener('click', () => {
            wasPinAction = false;
            map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true, maximumAge: 0, timeout: 10000});
        });

        document.getElementById('pin-my-location-btn-map').addEventListener('click', () => {
            if (!currentUser || (currentUser.Role !== 'Admin' && currentUser.Role !== 'Editor' && currentUser.Role !== 'Viewer')) {
                alert("Bạn không có quyền thêm ghim.");
                return;
            }
            wasPinAction = true;
            map.locate({ setView: false, enableHighAccuracy: true, maximumAge: 0, timeout: 10000});
        });

        map.on('locationfound', function(e) {
            const radius = e.accuracy;
            
            if (locationMarker) {
                map.removeLayer(locationMarker);
            }

            locationMarker = L.layerGroup([
                L.circle(e.latlng, {radius: radius, weight: 1}),
                L.marker(e.latlng)
            ]).addTo(map);
            
            if (wasPinAction) {
                map.flyTo(e.latlng, 17); // Bay tới vị trí trước khi mở popup
                openAddMarkerPopup(e.latlng.lat, e.latlng.lng);
                wasPinAction = false; 
            }
        });

        map.on('locationerror', function(e) {
            alert("Lỗi định vị: " + e.message + "\nVui lòng cấp quyền truy cập vị trí cho trình duyệt.");
            wasPinAction = false;
        });
        // END: Added Geolocation Logic for Map Buttons    
    // 2. Tạo một LayerGroup để chứa các đối tượng được vẽ
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    // 3. Khởi tạo thanh công cụ vẽ
    const drawControl = new L.Control.Draw({
        edit: {
            featureGroup: drawnItems, // Chỉ định layer chứa các đối tượng có thể sửa/xóa
            remove: true
        },
        draw: {
            polygon: {
                shapeOptions: { color: 'purple' },
                allowIntersection: false,
                drawError: { color: 'orange', timeout: 1000 },
                showArea: true, // Hiển thị diện tích khi vẽ
                metric: true // Sử dụng hệ mét
            },
            polyline: {
                shapeOptions: { color: 'blue' }
            },
            circle: {
                shapeOptions: { color: 'green' }
            },
            rectangle: {
                shapeOptions: { color: 'red' }
            },
            marker: false // Tắt công cụ vẽ marker mặc định vì đã có chức năng riêng
        }
    });
    map.addControl(drawControl);

    // 4. Lắng nghe sự kiện khi một hình được tạo xong
    map.on(L.Draw.Event.CREATED, function (event) {
        const layer = event.layer;
        let popupContent = 'Chưa có thông tin đo lường.';

        // Tính toán và định dạng thông tin đo lường
        if (event.layerType === 'polygon' || event.layerType === 'rectangle') {
            const area = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]);
            const areaInHa = (area / 10000).toFixed(2); // Đổi m² sang hecta
            popupContent = `<b>Diện tích:</b> ${areaInHa} ha`;
        }
        else if (event.layerType === 'polyline') {
            const latlngs = layer.getLatLngs();
            let distance = 0;
            for (let i = 0; i < latlngs.length - 1; i++) {
                distance += latlngs[i].distanceTo(latlngs[i + 1]);
            }
            const distanceInKm = (distance / 1000).toFixed(2); // Đổi m sang km
            popupContent = `<b>Khoảng cách:</b> ${distanceInKm} km`;
        }
        else if (event.layerType === 'circle') {
            const radius = layer.getRadius();
            const area = Math.PI * Math.pow(radius, 2);
            const areaInHa = (area / 10000).toFixed(2);
            popupContent = `<b>Bán kính:</b> ${(radius/1000).toFixed(2)} km<br><b>Diện tích:</b> ${areaInHa} ha`;
        }

        // Gắn popup chứa thông tin vào hình vừa vẽ và thêm vào layer
        layer.bindPopup(popupContent);
        drawnItems.addLayer(layer);
    });
        map.on('popupopen', function() {
        isPopupOpen = true;
    });

    map.on('popupclose', function(e) {
        isPopupOpen = false;
        const popupNode = e.popup._contentNode;
        const closedLayer = e.popup._source;

        // TRƯỜNG HỢP 1: Popup là form CHỈNH SỬA -> Tự động lưu
        if (popupNode.querySelector('[id^="markerName-"]')) {
            if (closedLayer && closedLayer.markerData) {
                const markerId = closedLayer.markerData.id;
                const markerIndex = allMarkersData.findIndex(m => m.id === markerId);
                if (markerIndex > -1) {
                    const markerToEdit = allMarkersData[markerIndex];

                    // Kiểm tra quyền sở hữu trước khi tự động lưu
                    if (!currentUser || (currentUser.Role === 'Viewer'  && markerToEdit.Owner !== currentUser.Username) || (currentUser.Role === 'Editor' && markerToEdit.Owner !== currentUser.Username)) {
                        console.log("Tự động lưu bị hủy do không có quyền.");
                        // Tải lại marker gốc để hủy thay đổi trên form
                        setTimeout(() => {
                            markerLayerGroup.removeLayer(closedLayer);
                            renderMarker(markerToEdit);
                        }, 0);
                        return;
                    }
                    
                    // Logic tự động lưu...
                    const updatedData = {
                        name: popupNode.querySelector('[id^="markerName-"]').value || 'Địa điểm không tên',
                        desc: popupNode.querySelector('[id^="markerDesc-"]').value || '',
                        linkUrl: popupNode.querySelector('[id^="markerLink-"]').value || '',
                        inclusionDate: popupNode.querySelector('[id^="markerInclusionDate-"]').value,
                        type: popupNode.querySelector('[id^="markerType-"]').value
                    };
                    const finalMarkerData = { ...markerToEdit, ...updatedData };
                    allMarkersData[markerIndex] = finalMarkerData;
                    
                    setTimeout(async () => {
                        markerLayerGroup.removeLayer(closedLayer);
                        renderMarker(allMarkersData[markerIndex]);
                        updateUI();
                        // Gửi yêu cầu cập nhật lên Google Sheet
                        try {
                            await fetch(GOOGLE_SHEET_API_URL, {
                                method: 'POST',
                                // headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'updateMarker', marker: finalMarkerData })
                            });
                        } catch (error) { console.error('Lỗi khi tự động lưu ghim:', error); }
                    }, 0);
                }
            }
        } 
        // TRƯỜNG HỢP 2: Popup là form THÊM MỚI -> Xóa ghim tạm
        else if (tempMarker && closedLayer === tempMarker) {
            map.removeLayer(tempMarker);
            tempMarker = null;
        }
    });
    // --- HÀM XỬ LÝ ĐĂNG NHẬP, ĐĂNG XUẤT, PHÂN QUYỀN ---
    // async function fetchAccounts() {
    //     try {
    //         const response = await fetch(`${GOOGLE_SHEET_API_URL}?action=getAccounts&t=${new Date().getTime()}`);
    //         if (!response.ok) throw new Error('Không thể tải danh sách tài khoản.');
    //         allAccounts = await response.json();
    //     } catch (error) {
    //         console.error(error.message);
    //         // alert(error.message);
    //     }
    // }

    // THAY THẾ TOÀN BỘ HÀM NÀY
    function handleLogin(username, password) {
        // password = 'Admin@1234'
        // console.log("Đang đăng nhập với:", username, password);
        const loginMessage = document.getElementById('map-blocker-message');

        if (!username || !password) {
            loginMessage.textContent = 'Vui lòng nhập đầy đủ thông tin.';
            // loginMessage.style.color = 'red';
            return;
        }
        
        updateAuthUI();
        document.getElementById('login-btn').disabled = true;
        document.getElementById('auth-toggle-btn').disabled = true;
        loginMessage.textContent = 'Đang xác thực...';
        // Gửi thông tin đăng nhập đến Google Script để xác thực
        fetch(GOOGLE_SHEET_API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'validateCredentials',
                username: username,
                password: password
            }),
        })
        .then(response => response.json())
        .then(async data => {
            if (data.success) {
                loginMessage.textContent = 'Đăng nhập thành công!';
                // loginMessage.style.color = 'green';
                
                currentUser = data.user;
                currentUser.Password = password;
                // Lưu thông tin người dùng (không có mật khẩu) vào localStorage
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                // console.log("Người dùng hiện tại:", localStorage);
                document.getElementById('login-popup').classList.remove('show');
                document.getElementById('map-blocker-message').textContent = 'Đang tải dữ liệu...';

                await loadMarkers(); // Tải dữ liệu ghim
                
                unlockMap(); // Mở khóa bản đồ và hiện sidebar
                updateUI();  // Cập nhật nội dung sidebar
                
                updateAuthUI();
                document.getElementById('login-btn').disabled = false;
                document.getElementById('auth-toggle-btn').disabled = false;
            } else {
                handleLogout();
                loginMessage.textContent = data.message || 'Lỗi không xác định.';
                document.getElementById('login-btn').disabled = false;
                document.getElementById('auth-toggle-btn').disabled = false;
            }
        })
        .catch(error => {
            console.error('Lỗi đăng nhập:', error);
            handleLogout();
            loginMessage.textContent = 'Phiên đăng nhập đã hết hạn. Vui lòng (F5) thử lại.';
            document.getElementById('login-btn').disabled = false;
            document.getElementById('auth-toggle-btn').disabled = false;
        });
    }

    function handleLogout() {
        // 1. Xóa thông tin người dùng hiện tại
        currentUser = null;
        localStorage.removeItem('currentUser');

        // 2. Dọn dẹp dữ liệu và bản đồ (KHẮC PHỤC LỖI DỮ LIỆU CŨ CÒN SÓT LẠI)
        allMarkersData = []; // Xóa sạch mảng dữ liệu ghim
        markerLayerGroup.clearLayers(); // Xóa sạch các ghim trên bản đồ
        drawnItems.clearLayers(); // Xóa sạch các hình đã vẽ

        // 3. Đặt lại và cập nhật giao diện
        lockMap(); // Khóa bản đồ và hiện thông báo yêu cầu đăng nhập
        updateAuthUI(); // Cập nhật lại giao diện đăng nhập/thông tin người dùng
        document.getElementById('timeline-container').classList.remove('visible'); // Ẩn thanh trượt
    }

    function updateAuthUI() {
        const loginPopup = document.getElementById('login-popup');
        const authToggleBtn = document.getElementById('auth-toggle-btn');
        const userInfo = document.getElementById('user-info');
        
        if (currentUser) {
            // Đã đăng nhập
            loginPopup.classList.remove('show');
            authToggleBtn.style.display = 'none';
            userInfo.classList.add('show');
            document.getElementById('user-fullname').textContent = currentUser.FullName;
            document.getElementById('user-role').textContent = currentUser.Role;
        } else {
            // Chưa đăng nhập
            userInfo.classList.remove('show');
            authToggleBtn.style.display = 'block';
        }
        
        applyPermissions();
    }

    function applyPermissions() {
        // Ẩn/hiện tất cả các phần tử theo quyền
        const adminOnlyElements = document.querySelectorAll('.admin-only');
        const editorOnlyElements = document.querySelectorAll('.editor-only');
        const loggedInOnlyElements = document.querySelectorAll('.logged-in-only');

        // Ẩn tất cả các nhóm theo mặc định
        adminOnlyElements.forEach(el => el.style.display = 'none');
        editorOnlyElements.forEach(el => el.style.display = 'none');
        loggedInOnlyElements.forEach(el => el.style.display = 'none');

        // Nếu người dùng đã đăng nhập, bắt đầu hiển thị các phần tử tương ứng
        if (currentUser) {
            // Hiện các phần tử cho tất cả người dùng đã đăng nhập
            loggedInOnlyElements.forEach(el => {
                // Trường hợp đặc biệt cho container nút định vị vì nó dùng 'flex'
                if (el.id === 'location-controls-container') {
                    el.style.display = 'flex';
                } else {
                    el.style.display = 'block'; // Mặc định là 'block' cho các phần tử khác
                }
            });
            
            // Hiện các phần tử theo vai trò (Role)
            if (currentUser.Role === 'Admin') {
                adminOnlyElements.forEach(el => el.style.display = 'block');
                editorOnlyElements.forEach(el => el.style.display = 'block');
            } else if (currentUser.Role === 'Editor' || currentUser.Role === 'Viewer') {
                editorOnlyElements.forEach(el => el.style.display = 'block');
            }
        }
        
        // Vô hiệu hóa/Kích hoạt các chức năng không có class
        document.getElementById('save-btn').style.display = (currentUser && (currentUser.Role === 'Admin' || currentUser.Role === 'Editor' || currentUser.Role === 'Viewer')) ? 'block' : 'none';

        // Vô hiệu hóa/Kích hoạt thanh công cụ vẽ
        const drawToolbar = document.querySelector('.leaflet-draw');
        if (drawToolbar) {
            drawToolbar.style.display = (currentUser && (currentUser.Role === 'Admin' || currentUser.Role === 'Editor' || currentUser.Role === 'Viewer')) ? 'block' : 'none';
        }
        const editToolbar = document.querySelector('.leaflet-draw-edit');
        if (editToolbar) {
            editToolbar.style.display = (currentUser && (currentUser.Role === 'Admin' || currentUser.Role === 'Editor' || currentUser.Role === 'Viewer')) ? 'block' : 'none';
        }
    }

    function disableMapInteraction() {
        map.dragging.disable();
        map.touchZoom.disable();
        map.doubleClickZoom.disable();
        map.scrollWheelZoom.disable();
        map.boxZoom.disable();
        map.keyboard.disable();
        if (map.tap) map.tap.disable();
        document.getElementById('map').style.cursor = 'default';
        document.getElementById('location-controls-container').style.display = 'none';
        Array.from(document.getElementsByClassName('leaflet-control-container')).forEach(el => el.style.display = 'none');
    }

    function enableMapInteraction() {
        map.dragging.enable();
        map.touchZoom.enable();
        map.doubleClickZoom.enable();
        map.scrollWheelZoom.enable();
        map.boxZoom.enable();
        map.keyboard.enable();
        if (map.tap) map.tap.enable();
        document.getElementById('map').style.cursor = 'grab';
        document.getElementById('location-controls-container').style.display = 'flex';
        Array.from(document.getElementsByClassName('leaflet-control-container')).forEach(el => el.style.display = 'block');
    }

    function lockMap() {
        document.getElementById('map-blocker-message').textContent = 'Vui lòng đăng nhập để sử dụng bản đồ';
        document.getElementById('map-blocker').classList.remove('hidden');
        document.getElementById('sidebar').classList.remove('visible', 'open');
        document.getElementById('toggle-btn').classList.remove('visible', 'shifted');
        document.getElementById('export-excel-btn').removeEventListener('click', exportVisibleMarkersToExcel);
        //=======================
        isAnalysisMode = false;
        document.getElementById('toggle-analysis-btn').textContent = 'Bật Phân Tích';
        document.getElementById('toggle-analysis-btn').style.backgroundColor = '#28a745';
        document.getElementById('analysis-results-container').style.display = 'none';
        clearAnalysisResults();
        document.getElementById('epsilon-container').classList.remove('active');
        //=======================
        isHeatmapMode = false;
        // document.getElementById('test-filter-btn').removeEventListener('click', getFilteredData);
        // ---- BỔ SUNG SỬA LỖI ----
        // Tìm đến icon và đặt lại về trạng thái ban đầu (biểu tượng menu)
        const toggleBtnIcon = document.getElementById('toggle-btn').querySelector('i');
        if (toggleBtnIcon) {
            toggleBtnIcon.classList.remove('fa-xmark');
            toggleBtnIcon.classList.add('fa-bars');
        }
        // ---- KẾT THÚC BỔ SUNG ----

        markerLayerGroup.clearLayers();
        drawnItems.clearLayers();
        updateUI(); // Xóa sạch sidebar
        disableMapInteraction();

    }

    function unlockMap() {
        document.getElementById('map-blocker').classList.add('hidden');
        document.getElementById('sidebar').classList.add('visible');
        document.getElementById('toggle-btn').classList.add('visible');
        document.getElementById('export-excel-btn').addEventListener('click', exportVisibleMarkersToExcel);
        // document.getElementById('test-filter-btn').addEventListener('click', () => {
            
        //     console.table('Danh sách đầy đủ các ghim đã lọc:', fullFilteredList);
        //     alert(`Tìm thấy tổng cộng ${fullFilteredList.length} ghim khớp với bộ lọc.`);
        // })
        enableMapInteraction();
        applyPermissions(); // Áp dụng lại quyền sau khi mở khóa
        setupTimelineSlider(); // Khởi tạo thanh trượt
    }

    async function checkSession() {
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
            let checkSessionUser = JSON.parse(storedUser);
            // console.log("Phiên đăng nhập tìm thấy:", currentUser);
            handleLogin(checkSessionUser.Username, checkSessionUser.Password);
        } else {
            updateAuthUI(); // Luôn cập nhật giao diện đăng nhập
        }
    }
    function exportVisibleMarkersToExcel() {
        // THAY ĐỔI QUAN TRỌNG: Lấy dữ liệu từ hàm lọc thay vì từ màn hình bản đồ
        const markersToExport = getFilteredData();

        if (markersToExport.length === 0) {
            // Cập nhật lại thông báo cho chính xác
            alert("Không có ghim nào khớp với bộ lọc để trích xuất.");
            return;
        }

        // Tạo nội dung bảng HTML cho tệp Excel
        let tableHTML = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head><meta charset='UTF-8'></head>
            <body>
            <table>
                <thead>
                    <tr>
                        <th>STT</th>
                        <th>Tên ghim</th>
                        <th>Mô tả</th>
                        <th>Link</th>
                        <th>Ngày vào diện</th>
                        <th>Tọa độ</th>
                        <th>Tài khoản tạo</th>
                    </tr>
                </thead>
                <tbody>
        `;

        markersToExport.forEach((marker, index) => {
            // Làm sạch dữ liệu trước khi thêm vào bảng
            const name = marker.name || '';
            const desc = marker.desc || '';
            const linkUrl = marker.linkUrl || '';
            const inclusionDate = marker.inclusionDate || '';
            const coords = `${marker.lat}, ${marker.lng}`;
            const owner = marker.Owner || '';

            tableHTML += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${name.replace(/</g, "<").replace(/>/g, ">")}</td>
                    <td>${desc.replace(/</g, "<").replace(/>/g, ">")}</td>
                    <td>${linkUrl.replace(/</g, "<").replace(/>/g, ">")}</td>
                    <td>${inclusionDate}</td>
                    <td>${coords}</td>
                    <td>${owner.replace(/</g, "<").replace(/>/g, ">")}</td>
                </tr>
            `;
        });

        tableHTML += `
                </tbody>
            </table>
            </body>
            </html>
        `;

        // Tạo tên tệp với ngày tháng năm hiện tại
        const today = new Date();
        const day = String(today.getDate()).padStart(2, '0');
        const month = String(today.getMonth() + 1).padStart(2, '0'); // Tháng trong JS bắt đầu từ 0
        const year = today.getFullYear();
        const fileName = `DS_ghim_${day}${month}${year}.xls`;

        // Tạo Blob và link để tải xuống
        const blob = new Blob([tableHTML], {
            type: 'application/vnd.ms-excel;charset=utf-8'
        });

        const link = document.createElement('a');
        if (navigator.msSaveBlob) { // Dành cho IE 10+
            navigator.msSaveBlob(blob, fileName);
        } else {
            link.href = URL.createObjectURL(blob);
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href); // Giải phóng bộ nhớ
        }
    }
    function getFilteredData() {
        const isAdmin = currentUser && currentUser.Role === 'Admin';
        const searchTerm = document.getElementById('search-pinned') ? document.getElementById('search-pinned').value.toLowerCase() : '';

        // Bắt đầu lọc từ danh sách gốc 'allMarkersData'
        let filteredMarkers = allMarkersData.filter(marker => {
            if (!marker) return false;
            
            // Điều kiện lọc theo loại ghim
            const typeMatch = selectedTypeKeys.has(marker.type);
            
            // Điều kiện lọc theo người tạo (chỉ áp dụng cho Admin)
            const ownerMatch = isAdmin ? selectedUserOwners.has(marker.Owner) : true;
            const timelineMatch = (() => {
            // Nếu thanh trượt không hoạt động hoặc không hiển thị, luôn trả về true
                const timelineContainer = document.getElementById('timeline-container');
                if (!timelineContainer.classList.contains('visible') || !selectedTimelineStartDate || !selectedTimelineEndDate) {
                    return true;
                }
                // Nếu ghim không có ngày, luôn hiển thị
                if (!marker.inclusionDate) return true;
                
                const markerDate = new Date(marker.inclusionDate);
                // So sánh ngày (không tính giờ)
                return markerDate.setHours(0,0,0,0) <= selectedTimelineEndDate.setHours(0,0,0,0);
            })();
            return typeMatch && ownerMatch && timelineMatch;
        });

        // Tiếp tục lọc theo từ khóa tìm kiếm trên kết quả đã có
        if (searchTerm) {
            filteredMarkers = filteredMarkers.filter(marker =>
                (marker.name && marker.name.toLowerCase().includes(searchTerm)) ||
                (marker.desc && marker.desc.toLowerCase().includes(searchTerm))
            );
        }

        // Trả về danh sách cuối cùng
        return filteredMarkers;
    }
    function setupTimelineSlider() {
        const timelineContainer = document.getElementById('timeline-container');
        const toggleBtn = document.getElementById('toggle-timeline-btn');
        const slider = document.getElementById('timeline-slider');

        // Lấy tất cả các ngày hợp lệ và chuyển thành timestamp
        const dates = allMarkersData
            .map(m => m.inclusionDate)
            .filter(Boolean)
            .map(d => new Date(d).getTime());

        if (dates.length < 2) {
            toggleBtn.style.display = 'none'; // Ẩn nút bấm nếu không đủ dữ liệu
            timelineContainer.classList.remove('visible'); // Đảm bảo thanh trượt cũng ẩn
            toggleBtn.classList.remove('active');
            return;
        }

        // Xác định ngày bắt đầu và kết thúc
        timelineMinDate = new Date(Math.min(...dates));
        timelineMaxDate = new Date(Math.max(...dates));
        selectedTimelineStartDate = timelineMinDate;
        selectedTimelineEndDate = timelineMaxDate;

        // Thiết lập các giá trị cho thanh trượt
        slider.min = timelineMinDate.getTime();
        slider.max = timelineMaxDate.getTime();
        slider.value = timelineMaxDate.getTime(); // Bắt đầu ở giá trị cuối cùng

        // Cập nhật các nhãn ngày
        updateTimelineLabels();
        masterFilter(); // Gọi lại hàm lọc chính
        // Gắn sự kiện khi người dùng kéo thanh trượt
        slider.addEventListener('input', (e) => {
            // Cập nhật ngày kết thúc dựa trên vị trí thanh trượt
            selectedTimelineEndDate = new Date(parseInt(e.target.value));
            updateTimelineLabels();
            masterFilter(); // Gọi lại hàm lọc chính
        });

        toggleBtn.style.display = 'flex'; // Hiện nút bấm
    }

    /**
     * Cập nhật các nhãn hiển thị ngày bắt đầu và kết thúc.
     */
    function updateTimelineLabels() {
        const startDateLabel = document.getElementById('timeline-date-label-start');
        const endDateLabel = document.getElementById('timeline-date-label-end');
        
        // Hàm phụ để định dạng ngày
        const formatDate = (date) => {
            if (!date) return '--/--/----';
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        };

        startDateLabel.textContent = formatDate(selectedTimelineStartDate);
        endDateLabel.textContent = formatDate(selectedTimelineEndDate);
    }
    const clearCacheBtn = document.getElementById('clear-cache-btn');
    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', () => {
            const confirmation = confirm("Bạn có chắc chắn muốn xóa toàn bộ dữ liệu ghim đã lưu trên máy này? Hành động này sẽ yêu cầu tải lại toàn bộ dữ liệu vào lần tới.");
            if (confirmation) {
                localStorage.removeItem(MARKER_CACHE_KEY);
                alert("Đã xóa bộ đệm thành công! Trang sẽ được tải lại.");
                location.reload();
            }
        });
    }
    var myIconDao = L.icon({
        iconUrl: '/icons/basic.png',
        
        // Bạn sẽ cần tinh chỉnh các giá trị này để khớp với ảnh icon của bạn
        iconSize:     [75, 75], // Kích thước của ảnh icon (ví dụ: 25x41 pixels)
        iconAnchor:   [40, 40], // Điểm neo (giữa đầu) của icon
        popupAnchor:  [1, -34]  // Điểm mà popup sẽ bật ra (so với iconAnchor)
    });
    // 1. Ghim Quần đảo Hoàng Sa
        var hoangSa = L.marker([16.545712, 112.167452], { icon: myIconDao }).addTo(map);
        hoangSa.bindPopup(`
            <div class="info-popup">
                <h5>Quần đảo Hoàng Sa</h5>
                <div class="description-container"><strong>Mô tả: </strong><p>Quần đảo Hoàng Sa thuộc thành phố Đà Nẵng.</p></div>
                <div class="coords">
                    <span onclick="copyCoords(16.545712, 112.167452); event.stopPropagation();" title="Bấm để sao chép tọa độ" style="cursor: pointer; font-weight: bold;">
                        16.54571, 112.16745
                    </span>
                    <span class="coord-actions">                     
                        <a href="https://www.google.com/maps/dir/?api=1&destination=16.545712,112.167452" target="_blank" title="Chỉ đường Google Maps"><i class="fa-solid fa-diamond-turn-right"></i></a>
                    </span>
                </div>
            </div>`);

        // 2. Ghim Quần đảo Trường Sa
        var truongSa = L.marker([10.691918, 115.802982], { icon: myIconDao }).addTo(map);;
        truongSa.bindPopup(`
            <div class="info-popup">
                <h5>Quần đảo Trường Sa</h5>
                <div class="description-container"><strong>Mô tả: </strong><p>Quần đảo Trường Sa thuộc tỉnh Khánh Hòa.</p></div>
                <div class="coords">
                    <span onclick="copyCoords(10.691918, 115.802982); event.stopPropagation();" title="Bấm để sao chép tọa độ" style="cursor: pointer; font-weight: bold;">
                        10.69192, 115.80298
                    </span>
                    <span class="coord-actions">                     
                        <a href="https://www.google.com/maps/dir/?api=1&destination=10.691918,115.802982" target="_blank" title="Chỉ đường Google Maps"><i class="fa-solid fa-diamond-turn-right"></i></a>
                    </span>
                </div>
            </div>`);
    initializeApp();
});