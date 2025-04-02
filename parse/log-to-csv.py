import os
import sys
import re
import csv
import matplotlib.pyplot as plt
from matplotlib.ticker import MaxNLocator

from parse import result_cpu
from result_integration import sort_key

args = sys.argv


def cpu_vec(bench_dir,log_dir,method):
    benchmark_files = sorted([f for f in os.listdir(bench_dir) if f.endswith('.col')], key=sort_key)
    cpus = []

    for benchmark_file in benchmark_files:
        log_file = log_dir+benchmark_file+"."+method+".time1800.log"
        res_cpu = result_cpu(log_file)
        if res_cpu=="TO":
            cpus.append(res_cpu)
        else:
            cpus.append(float(res_cpu))
    return cpus

def cpu_csv(bench_dir,log_dir,output_file,methods):
    methods_cpus = []
    vbs = []
    for method in methods:
        cpus = cpu_vec(bench_dir,log_dir,method)
        methods_cpus.append(cpus)

    
    with open(output_file, 'w') as f:

        fieldnames = ['問題番号']
        fieldnames.extend(methods)
        fieldnames.append('VBS')
        writer = csv.writer(f)
        writer.writerow(fieldnames)

        for i in range(1001):
            row = [i+1]
            vb = "TO"
            
            for j in range(len(methods)):

                row.append(methods_cpus[j][i])

                if vb == "TO":
                    vb = methods_cpus[j][i]
                elif methods_cpus[j][i] != "TO":
                    if vb > methods_cpus[j][i]:
                        vb = methods_cpus[j][i]
            
            vbs.append(vb)
            row.append(vb)

            writer.writerow(row)

    methods_cpus.append(vbs)

    return methods_cpus

def cpu_cactus(methods_cpus,output_file,methods):
    removed_cpus =  [[x for x in sublist if x != "TO"] for sublist in methods_cpus]
    # sorted_pairs = sorted(zip(removed_cpus,methods),key=len)
    # sorted_cpus,sorted_methods = zip(*sorted_pairs)
    pairs = list(zip(removed_cpus, methods))
    sorted_pairs = sorted(pairs, key=lambda x: len(x[0]))
    sorted_cpus,sorted_methods = zip(*sorted_pairs)

    for i,data in enumerate(sorted_cpus):
        sorted_data = sorted(data)
        plt.plot(
            range(1,len(sorted_data)+1),
            data,
            label=sorted_methods[i]
        )
    # plt.xlabel("benchmark ", fontsize=18)
    # plt.ylabel("CPU時間[s]",fontsize=18)
    plt.ylim(0,1800)
    plt.xlim(0,1001)
    plt.xticks([0,100,200,300,400,500,600,700,800,900,1001],fontsize=30)
    plt.yticks(fontsize=30)
    plt.legend(bbox_to_anchor=(0, 1),loc='upper left', borderaxespad=1,fontsize=20)
    plt.gcf().set_size_inches(16, 9)
    plt.savefig(output_file, format="pdf")
    plt.show()



# 生ログからcpuを取得し、csvへ書き込むメソッド
# 入力は、bench_dir,log_dir,output_file,methods
# methodsは取得したいログのメソッド名（proposed-cegar-cadical-sinz proposed-cegar-2loop-cadical-sinz)など
methods_cpus = cpu_csv(args[1],args[2],args[3],args[5:])


# methods = input().split()
# methods.append("VBS")
# print(methods)
# cpu_cactus(methods_cpus,args[4],methods)