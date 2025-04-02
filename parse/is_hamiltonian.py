import os
import csv
import re
import subprocess
import sys


args = sys.argv

graphfile = args[1]
inputfile = args[2]

def extract_solution(filename):
    with open(filename, 'r') as file:
        lines = file.readlines()
    for i in range(len(lines)):
        if 'solution:' in lines[i]:
            solution_line = lines[i+1]
            solution = list(map(int, solution_line.split()))
            return solution


with open(graphfile) as f:
    lines = f.readlines()

edges = {}
for line in lines :
    if line.startswith('p'):
        n= int(line.split()[1])
    if line.startswith('e'):
        u, v = list(map(int,line.split()[1:]))
        if u not in edges:
            edges[u] = []
        if v not in edges:
            edges[v] = []
        edges[u].append(v)
        edges[v].append(u)

# 解答データ
solution = extract_solution(inputfile)


is_hamiltonian = True
if len(solution) != n:
    print("経路長が足りない")
    print("n=",n)
    print("len(solution)=",len(solution))
    is_hamiltonian = False
# ハミルトン閉路の確認

for i in range(len(solution)):
    if solution[(i+1)%len(solution)] not in edges[solution[i]]:
        is_hamiltonian = False
        v = (solution[i])
        u = (solution[(i+1)%len(solution)])
        print(str(v)+"と"+str(u)+"の辺が無い")
        break

print(is_hamiltonian)
