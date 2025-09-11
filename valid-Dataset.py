# -*- coding: utf-8 -*-
"""
Tệp script này chuyển đổi thuật toán mã giả thành một kịch bản Python có thể chạy được
để xây dựng bộ dữ liệu huấn luyện cho việc dự đoán vị trí ghim.
"""

import pandas as pd
import numpy as np
from datetime import timedelta

# =============================================
# CÁC HÀM TIỆN ÍCH (HELPER FUNCTIONS)
# =============================================

def create_grid(pins_df, cell_size_deg):
    """
    Tạo một lưới 2D dựa trên phạm vi tọa độ của dữ liệu.
    
    Args:
        pins_df (pd.DataFrame): DataFrame chứa tọa độ các ghim.
        cell_size_deg (float): Kích thước của mỗi ô lưới (tính bằng độ).
        
    Returns:
        list: Một danh sách các ô, mỗi ô là một dictionary chứa thông tin về ô đó.
    """
    min_lat, max_lat = pins_df['lat'].min(), pins_df['lat'].max()
    min_lng, max_lng = pins_df['lng'].min(), pins_df['lng'].max()
    
    grid = []
    lat_steps = np.arange(min_lat, max_lat, cell_size_deg)
    lng_steps = np.arange(min_lng, max_lng, cell_size_deg)
    
    cell_id_counter = 0
    for i in range(len(lat_steps)):
        for j in range(len(lng_steps)):
            cell = {
                'id': cell_id_counter,
                'min_lat': lat_steps[i],
                'max_lat': lat_steps[i] + cell_size_deg,
                'min_lng': lng_steps[j],
                'max_lng': lng_steps[j] + cell_size_deg,
                'center_lat': lat_steps[i] + cell_size_deg / 2,
                'center_lng': lng_steps[j] + cell_size_deg / 2,
            }
            grid.append(cell)
            cell_id_counter += 1
            
    return grid

def haversine_distance(lat1, lon1, lat2, lon2):
    """
    Tính khoảng cách (km) giữa hai điểm tọa độ.
    """
    R = 6371  # Bán kính Trái Đất (km)
    
    lat1_rad = np.radians(lat1)
    lon1_rad = np.radians(lon1)
    lat2_rad = np.radians(lat2)
    lon2_rad = np.radians(lon2)
    
    dlon = lon2_rad - lon1_rad
    dlat = lat2_rad - lat1_rad
    
    a = np.sin(dlat / 2)**2 + np.cos(lat1_rad) * np.cos(lat2_rad) * np.sin(dlon / 2)**2
    c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))
    
    return R * c

# =============================================
# HÀM CHÍNH ĐỂ XÂY DỰNG ĐẶC TRƯNG
# =============================================

def create_training_dataset(pins_df, start_date, end_date, time_step_days=1, cell_size_deg=0.01):
    """
    Hàm chính để tạo bộ dữ liệu huấn luyện từ dữ liệu ghim thô.
    """
    
    # Chuyển đổi cột ngày tháng sang định dạng datetime
    pins_df['inclusionDate'] = pd.to_datetime(pins_df['inclusionDate'])
    
    # Bước 1: Khởi tạo lưới và các biến
    grid = create_grid(pins_df, cell_size_deg)
    all_pin_types = pins_df['type'].unique()
    training_data = []

    # Bước 2: Vòng lặp chính qua từng bước thời gian
    current_date = start_date
    while current_date <= end_date:
        T = current_date
        print(f"Processing date: {T.strftime('%Y-%m-%d')}")
        
        # Lọc dữ liệu ghim theo thời gian
        historical_pins = pins_df[pins_df['inclusionDate'] < T]
        new_pins_in_T = pins_df[
            (pins_df['inclusionDate'] >= T) & 
            (pins_df['inclusionDate'] < T + timedelta(days=time_step_days))
        ]

        # Vòng lặp qua từng ô trong lưới để tính đặc trưng
        for cell in grid:
            features = {}
            features['cell_id'] = cell['id']
            features['timestamp'] = T

            # Lấy các ghim lịch sử trong ô hiện tại
            pins_in_cell = historical_pins[
                (historical_pins['lat'] >= cell['min_lat']) & (historical_pins['lat'] < cell['max_lat']) &
                (historical_pins['lng'] >= cell['min_lng']) & (historical_pins['lng'] < cell['max_lng'])
            ]

            # 1. Đặc trưng Mật độ & Số lượng
            features['count_total'] = len(pins_in_cell)
            for pin_type in all_pin_types:
                features[f'count_{pin_type}'] = pins_in_cell[pins_in_cell['type'] == pin_type].shape[0]

            # 2. Đặc trưng Thời gian
            if not pins_in_cell.empty:
                last_pin_date = pins_in_cell['inclusionDate'].max()
                features['time_since_last_pin'] = (T - last_pin_date).days
                
                pins_last_30_days = pins_in_cell[pins_in_cell['inclusionDate'] >= T - timedelta(days=30)]
                features['count_last_30_days'] = len(pins_last_30_days)
            else:
                features['time_since_last_pin'] = None # Hoặc một giá trị lớn
                features['count_last_30_days'] = 0

            # 3. Đặc trưng Không gian & Lân cận
            # (Phần này có thể chậm và cần tối ưu hóa trong thực tế)
            distances = haversine_distance(cell['center_lat'], cell['center_lng'], 
                                           historical_pins['lat'], historical_pins['lng'])
            
            neighborhood_pins = historical_pins[distances <= 0.5] # Bán kính 500m
            features['neighborhood_density_500m'] = len(neighborhood_pins)

            for pin_type in all_pin_types:
                type_pins = historical_pins[historical_pins['type'] == pin_type]
                if not type_pins.empty:
                    dist_to_type = haversine_distance(cell['center_lat'], cell['center_lng'],
                                                    type_pins['lat'], type_pins['lng'])
                    features[f'dist_to_nearest_{pin_type}'] = dist_to_type.min()
                else:
                    features[f'dist_to_nearest_{pin_type}'] = None # Hoặc một giá trị lớn

            # Tạo Nhãn (Label)
            new_pins_in_cell = new_pins_in_T[
                (new_pins_in_T['lat'] >= cell['min_lat']) & (new_pins_in_T['lat'] < cell['max_lat']) &
                (new_pins_in_T['lng'] >= cell['min_lng']) & (new_pins_in_T['lng'] < cell['max_lng'])
            ]
            label = 1 if not new_pins_in_cell.empty else 0
            
            # Thêm vào bộ dữ liệu
            features['label'] = label
            training_data.append(features)
        
        current_date += timedelta(days=time_step_days)

    return pd.DataFrame(training_data)


# =============================================
# KHỐI THỰC THI CHÍNH
# =============================================
if __name__ == '__main__':
    # --- Tải dữ liệu ---
    # Thay 'path/to/your/Markers.csv' bằng đường dẫn thực tế
    try:
        # Giả sử file CSV của bạn có các cột: lat, lng, type, inclusionDate
        pins_df = pd.read_csv('data-map.xlsx - Markers.csv') 
        pins_df['type'] = pins_df['type'].astype('category')
        print("Tải dữ liệu thành công.")
    except FileNotFoundError:
        print("Lỗi: Không tìm thấy file dữ liệu. Vui lòng tạo file CSV mẫu hoặc chỉ định đường dẫn đúng.")
        # Tạo dữ liệu mẫu nếu không có file
        sample_data = {
            'lat': [10.7769, 10.7758, 10.7780, 10.7765],
            'lng': [106.7009, 106.7012, 106.7005, 106.7020],
            'type': ['restaurant', 'school', 'restaurant', 'cafe'],
            'inclusionDate': ['2025-01-10', '2025-02-15', '2025-03-20', '2025-04-01']
        }
        pins_df = pd.DataFrame(sample_data)

    # --- Thiết lập các tham số ---
    start_date = pd.to_datetime('2025-03-01')
    end_date = pd.to_datetime('2025-04-01')
    
    # --- Chạy thuật toán ---
    print("Bắt đầu xây dựng bộ dữ liệu huấn luyện...")
    training_df = create_training_dataset(
        pins_df=pins_df,
        start_date=start_date,
        end_date=end_date,
        time_step_days=7, # Xử lý theo từng tuần
        cell_size_deg=0.005 # Kích thước ô lưới ~500m
    )
    
    print("Hoàn thành xây dựng bộ dữ liệu.")
    print(f"Kích thước bộ dữ liệu: {training_df.shape[0]} hàng, {training_df.shape[1]} cột.")
    
    # Hiển thị một vài dòng đầu tiên của kết quả
    print("\n5 dòng đầu tiên của bộ dữ liệu:")
    print(training_df.head())

    # Lưu kết quả ra file CSV để sử dụng sau này
    training_df.to_csv('training_dataset.csv', index=False)
    print("\nĐã lưu bộ dữ liệu vào file 'training_dataset.csv'.")