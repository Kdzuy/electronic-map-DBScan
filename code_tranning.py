# -*- coding: utf-8 -*-
"""
Tệp script này dùng để huấn luyện mô hình LightGBM (Gradient Boosting)
dựa trên bộ dữ liệu đã được xử lý và xây dựng đặc trưng.
"""

import pandas as pd
import lightgbm as lgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, roc_auc_score
import matplotlib.pyplot as plt
import seaborn as sns
import joblib

# =============================================
# HÀM CHÍNH ĐỂ HUẤN LUYỆN
# =============================================

def train_prediction_model(data_path='training_dataset.csv'):
    """
    Hàm chính để tải dữ liệu, huấn luyện mô hình và đánh giá hiệu suất.
    """
    # --- 1. Tải và Chuẩn bị Dữ liệu ---
    print("Bắt đầu quá trình huấn luyện mô hình...")
    try:
        df = pd.read_csv(data_path)
        print(f"Tải thành công dữ liệu từ '{data_path}'. Kích thước: {df.shape}")
    except FileNotFoundError:
        print(f"Lỗi: Không tìm thấy file '{data_path}'. Vui lòng chạy script tạo dữ liệu trước.")
        return

    # Xử lý giá trị bị thiếu (NaN).
    # Các mô hình cây có thể xử lý tốt các giá trị đặc biệt như -1.
    df = df.fillna(-1)
    
    # Xác định các cột đặc trưng (X) và cột mục tiêu (y)
    # Loại bỏ các cột không phải đặc trưng như ID và timestamp
    features = [col for col in df.columns if col not in ['cell_id', 'timestamp', 'label']]
    X = df[features]
    y = df['label']

    # Kiểm tra sự mất cân bằng của dữ liệu (thường gặp trong bài toán này)
    label_counts = y.value_counts()
    print(f"Phân phối nhãn: \n{label_counts}")
    if label_counts.get(1, 0) == 0:
        print("Lỗi: Không có mẫu nhãn dương (label=1) nào trong dữ liệu. Không thể huấn luyện.")
        return

    # --- 2. Chia Dữ liệu thành Tập Huấn luyện và Tập Kiểm tra ---
    # 80% cho huấn luyện, 20% cho kiểm tra
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y # stratify giữ tỷ lệ nhãn
    )
    print(f"Đã chia dữ liệu: {X_train.shape[0]} mẫu huấn luyện, {X_test.shape[0]} mẫu kiểm tra.")

    # --- 3. Khởi tạo và Huấn luyện Mô hình LightGBM ---
    print("\nBắt đầu huấn luyện mô hình LightGBM...")
    
    # `scale_pos_weight` rất quan trọng cho dữ liệu mất cân bằng.
    # Nó cho mô hình biết cần "chú ý" hơn đến các mẫu thiểu số (label=1).
    scale_pos_weight = label_counts[0] / label_counts[1]

    lgbm = lgb.LGBMClassifier(
        objective='binary',
        metric='auc',
        n_estimators=1000,
        learning_rate=0.05,
        num_leaves=31,
        max_depth=-1,
        random_state=42,
        n_jobs=-1,
        colsample_bytree=0.8,
        subsample=0.8,
        reg_alpha=0.1,
        reg_lambda=0.1,
        scale_pos_weight=scale_pos_weight 
    )

    # Huấn luyện mô hình
    lgbm.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        eval_metric='auc',
        callbacks=[lgb.early_stopping(100, verbose=True)] # Dừng sớm nếu hiệu suất không cải thiện
    )
    
    print("Huấn luyện hoàn tất.")

    # --- 4. Đánh giá Hiệu suất Mô hình ---
    print("\n--- Đánh giá mô hình trên tập kiểm tra ---")
    y_pred = lgbm.predict(X_test)
    y_pred_proba = lgbm.predict_proba(X_test)[:, 1]

    print(f"Accuracy: {accuracy_score(y_test, y_pred):.4f}")
    print(f"AUC Score: {roc_auc_score(y_test, y_pred_proba):.4f}")
    
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred))
    
    # Vẽ ma trận nhầm lẫn (Confusion Matrix)
    cm = confusion_matrix(y_test, y_pred)
    plt.figure(figsize=(8, 6))
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', 
                xticklabels=['Không xuất hiện (0)', 'Xuất hiện (1)'], 
                yticklabels=['Không xuất hiện (0)', 'Xuất hiện (1)'])
    plt.xlabel('Dự đoán')
    plt.ylabel('Thực tế')
    plt.title('Ma trận Nhầm lẫn')
    plt.show()

    # --- 5. Phân tích Mức độ Quan trọng của Đặc trưng ---
    lgb.plot_importance(lgbm, max_num_features=20, height=0.8, figsize=(10, 8))
    plt.title('Mức độ Quan trọng của 20 Đặc trưng Hàng đầu')
    plt.tight_layout()
    plt.show()
    
    # --- 6. Lưu Mô hình đã Huấn luyện ---
    model_filename = 'prediction_model.joblib'
    joblib.dump(lgbm, model_filename)
    print(f"\nMô hình đã được lưu vào file '{model_filename}'.")


# =============================================
# KHỐI THỰC THI CHÍNH
# =============================================
if __name__ == '__main__':
    train_prediction_model()