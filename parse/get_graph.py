import os

def get_node_edge(inputfile):

    with open(inputfile) as f:
        lines = f.readlines()

    for line in lines :

        if line.startswith("p"):
            graph = line.split()
            node = int(graph[1])
            edge = int(graph[2])
            return (node,edge)
    return (0,0)
