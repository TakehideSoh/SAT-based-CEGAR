import os
import sys
import re
import csv
import matplotlib.pyplot as plt
from matplotlib.ticker import MaxNLocator

from parse import result_cpu
from result_integration import sort_key

args = sys.argv

def vbs_by_csv(input_file,output_file):
    # CSVファイルの読み込み
    with open(input_file, 'r') as file:
        reader = csv.reader(file)
        data = list(reader)

    # ヘッダーにVBS列を追加
    header = data[0]
    header.append('VBS')

    # 各行についてVBSを計算
    for row in data[1:]:
        values = row[1:]  # 問題番号を除く
        float_values = [float(v) for v in values if v != 'TO']
        if float_values:
            vbs_value = min(float_values)
        else:
            vbs_value = 'TO'
        row.append(vbs_value)

    # 結果を新しいCSVファイルに保存
    with open(output_file, 'w', newline='') as file:
        writer = csv.writer(file)
        writer.writerows(data)



# cpu時間のcsvからvbsを追加したcsvを作成するメソッド
# 入力は、input_file,output_file
vbs_by_csv(args[1],args[2])