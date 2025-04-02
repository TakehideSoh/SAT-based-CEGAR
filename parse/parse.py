import os
import sys

def result_sat(inputfile):
    try:
        with open(inputfile) as f:  
            lines = f.readlines()   
    except FileNotFoundError as err:
        return False
    for line in lines :

        if line.startswith("s SAT"):
            return True
        if line.startswith("TIMEOUT") or line.startswith("error") or line.startswith("s UNSAT"):
            return False

def result_cpu(inputfile):
    try:
        with open(inputfile) as f:  
            lines = f.readlines()   
    except FileNotFoundError as err:
        return "TO"
    res_sat = False
    for line in lines :
        if line.startswith("s SATISFIABLE"):
            res_sat = True
        if line.startswith("FINISHED"):
            if res_sat:
                cpu = line.split()
                return cpu[2]
            else:
                return "TO"
        if line.startswith("TIMEOUT") or line.startswith("error") or line.startswith("s UNSAT"):
            return "TO"

def result_increment(inputfile):
    try:
        with open(inputfile) as f:  
            lines = f.readlines()   
    except FileNotFoundError as err:
        return "TO"
    for line in lines :
        if line.startswith("overall incremented"):
            cpu = line.split()
            return cpu[4]
        if line.startswith("TIMEOUT") or line.startswith("error") or line.startswith("s UNSAT"):
            return "TO"
    return "TO"



def main():
    args = sys.argv

    inputfile = args[1]

    with open(inputfile) as f:
        lines = f.readlines()

    for line in lines :

        if line.startswith("fatal runtime error"):
            print("err,-,-")
            break
        if line.startswith("TIMEOUT"):
            print("TO,-,-")
        if line.startswith("incremented"):
            ite = line.split('=')
            print("ok,"+ite[1].strip(),end='')
        if line.startswith("overall time"):
            cpu = line.split()
            print(","+cpu[-2].strip())



