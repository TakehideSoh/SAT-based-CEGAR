import os
import sys
import re
import csv
from get_graph import get_node_edge
from parse import result_sat

def sort_key(filename):
    # ファイル名から数字部分を抽出
    match = re.search(r'graph(\d+).col', filename)
    if match:
        # 数字部分を数値として返す
        return int(match.group(1))
    else:
        # マッチしない場合はファイル名をそのまま返す
        return filename

def res_sat():
    args = sys.argv
    node_ranges = [0,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000]
    bench_dir = args[1]
    # ディレクトリ内のすべてのベンチマークファイルとログファイルを取得
    benchmark_files = sorted([f for f in os.listdir(bench_dir) if f.endswith('.col')], key=sort_key)
    log_folder = args[2]
    output_file = args[3]
    experiments = args[4:]

    sat_num = [[0]*(len(experiments)) for i in range(len(node_ranges)-1)]
    sat_sum = [0]*(len(experiments))
    bench_nums = [0]*(len(node_ranges)-1)
    for benchmark_file in benchmark_files:
        (node,edge) = get_node_edge(bench_dir+benchmark_file)
        for i in range(len(node_ranges)-1):
            if node >= node_ranges[i] and node < node_ranges[i+1]:
                bench_nums[i] = bench_nums[i] + 1

        for i,arg in enumerate(experiments):
            log_file = log_folder+benchmark_file+"."+arg
            res_sat = result_sat(log_file)
            if res_sat:
                for j in range(len(node_ranges)-1):
                    if node >= node_ranges[j] and node < node_ranges[j+1]:
                        sat_num[j][i] = sat_num[j][i] + 1

    print(sat_num)

    with open(output_file, 'w') as f:
    # print("b")

        fieldnames = ['頂点数', '問題数']
        fieldnames.extend(experiments)
        writer = csv.writer(f)
        writer.writerow(fieldnames)

        for i in range(len(node_ranges)-1):
            node_num = str(node_ranges[i])+" \leq |V| < "+str(node_ranges[i+1])
            row = [node_num,bench_nums[i]]
            row.extend(sat_num[i])
            writer.writerow(row)
            
            sat_sum = [a + b for a, b in zip(sat_sum, sat_num[i])]
        
        row = ["合計",1001]
        row.extend(sat_sum)
        writer.writerow(row)

        

def res_cpu():
    args = sys.argv
    node_ranges = [0,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000]
    bench_dir = args[1]
    # ディレクトリ内のすべてのベンチマークファイルとログファイルを取得
    benchmark_files = sorted([f for f in os.listdir(bench_dir) if f.endswith('.col')], key=sort_key)
    log_file = args[2]
    output_file = args[3]
    experiments = []
    sat_num = []
    sat_sum = []
    bench_nums = []
    with open(log_file, newline='') as csvfile:
        reader = csv.reader(csvfile)
        experiments = next(reader)[1:]  # ヘッダーを読み込む
        print("Headers:", experiments)

        sat_num = [[0]*(len(experiments)) for i in range(len(node_ranges)-1)]
        sat_sum = [0]*(len(experiments))
        bench_nums = [0]*(len(node_ranges)-1)
        for i,row in enumerate(reader):
            # problem_number = row[0]
            values = row[1:]

            (node,edge) = get_node_edge(bench_dir+benchmark_files[i])
            for i in range(len(node_ranges)-1):
                if node >= node_ranges[i] and node < node_ranges[i+1]:
                    bench_nums[i] = bench_nums[i] + 1

            for i,value in enumerate(values):
                if value != 'TO':
                    for j in range(len(node_ranges)-1):
                        if node >= node_ranges[j] and node < node_ranges[j+1]:
                            sat_num[j][i] = sat_num[j][i] + 1

    print(sat_num)

    with open(output_file, 'w') as f:
    # print("b")

        fieldnames = ['\# Node', '\# Incetances']
        fieldnames.extend(experiments)
        writer = csv.writer(f)
        writer.writerow(fieldnames)

        for i in range(len(node_ranges)-1):
            node_num = "$\sim "+str(node_ranges[i+1])+"$"
            row = [node_num,bench_nums[i]]
            row.extend(sat_num[i])
            writer.writerow(row)
            
            sat_sum = [a + b for a, b in zip(sat_sum, sat_num[i])]
        
        row = ["Total",1001]
        row.extend(sat_sum)
        writer.writerow(row)

if __name__ == "__main__":
    # コマンドライン引数で、bench_dir,log_file,output_fileを受け取る
    # log_fileはcpu時間を記録したcsvファイル
    res_cpu()
