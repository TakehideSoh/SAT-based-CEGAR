mod encoder;
mod file_operations;
mod graph;
mod hcp_solver;
mod options;
use std::time::Instant;
use log::info;

fn main() {
    env_logger::init();
    info!("プログラム開始");
    let instant = Instant::now();

    let matches = options::get_options();

    // solver,encodingのオプションをintで受け取る
    let solver = matches.value_of_t::<i32>("solver").unwrap_or(0);
    let encoding = matches.value_of_t::<i32>("encoding").unwrap_or(0);
    let blocking = matches.value_of_t::<i32>("blocking").unwrap_or(0);
    let symmetry = matches.value_of_t::<i32>("symmetry").unwrap_or(0);
    let two_opt = matches.value_of_t::<i32>("2-opt").unwrap_or(0);
    let loop_prohibition = matches.value_of_t::<i32>("loop-prohibition").unwrap_or(0);
    let cnf_normalize = matches.value_of_t::<i32>("cnf-normalize").unwrap_or(0);
    let balanced = matches.value_of_t::<i32>("balanced").unwrap_or(0);
    let de_arcify = matches.value_of_t::<i32>("de-arcify").unwrap_or(0);
    let config = matches.value_of_t::<i32>("set-configration").unwrap_or(0);
    let degree_order = matches.value_of_t::<i32>("degree-order").unwrap_or(0);
    let arcs_order = matches.value_of_t::<i32>("arcs-order").unwrap_or(0);
    // solver,encodingのオプションを&strで受け取る
    let input_filename = matches.value_of("input").unwrap_or("default");
    let output_foldername = matches.value_of("output").unwrap_or("default");

    println!("solve {}", input_filename);
    // let g = instance();
    let mut g = file_operations::input_to_graph(input_filename);
    if de_arcify != 0{
        g.remove_redundant_arcs();
    }
    let time1 = instant.elapsed();
    // println!("encodhing time = {:?} sec",instant.elapsed().as_secs());
    // let instant2 = Instant::now();

    // println!("solver={},encoding={}",solver,encoding);
    // println!("{:?}",g);
    println!("file input time = {:?}", time1);
    hcp_solver::solve_hamilton(g, solver, encoding, blocking, symmetry, two_opt, loop_prohibition, cnf_normalize, balanced, de_arcify,config,degree_order,arcs_order,instant,output_foldername);
    let time2 = instant.elapsed() - time1;

    // println!("solving time = {:?} sec",instant2.elapsed().as_secs());
    println!("solving time = {:?}", time2);
    println!("overall time = {:?}", instant.elapsed());
    info!("プログラム終了");
}

fn _instance() -> graph::Graph {
    let mut g = graph::Graph::new();
    g.add_edge(1, 2);
    g.add_edge(1, 8);
    g.add_edge(2, 3);
    g.add_edge(3, 4);
    g.add_edge(3, 7);
    g.add_edge(4, 5);
    g.add_edge(4, 6);
    g.add_edge(4, 8);
    g.add_edge(5, 6);
    g.add_edge(6, 7);
    g.add_edge(7, 8);
    g
}

// fn add_cl(lit_names: BTreeMap<Lit, String>, instance: &mut SatInstance) {
//     let mut map_i: BTreeMap<String, Vec<Lit>> = BTreeMap::new();
//     let mut map_j: BTreeMap<String, Vec<Lit>> = BTreeMap::new();

//     for (lit, name) in lit_names.iter() {
//         let parts: Vec<&str> = name.split("_").collect();
//         map_i.entry(parts[0].to_string()).or_insert(Vec::new()).push(lit.clone());
//         map_j.entry(parts[1].to_string()).or_insert(Vec::new()).push(lit.clone());
//     }

//     for (_, lits) in map_i.iter() {
//         for i in 0..lits.len() {
//             for j in i+1..lits.len() {
//                 instance.add_binary(!lits[i], !lits[j]);
//             }
//         }
//         instance.add_clause(lits.as_slice().into());
//     }

//     for (_, lits) in map_j.iter() {
//         for i in 0..lits.len() {
//             for j in i+1..lits.len() {
//                 instance.add_binary(!lits[i], !lits[j]);
//             }
//         }
//         instance.add_clause(lits.as_slice().into());
//     }
// }

// fn check_hamilton(edges: Vec<&str>) -> bool {
//     let mut graph: BTreeMap<&str,&str> = std::collections::BTreeMap::new();
//     for edge in edges {
//         let nodes: Vec<&str> = edge.split('_').collect();
//         let from = nodes[0];
//         let to = nodes[1];
//         graph.insert(from, to);
//     }

//     let start_node = graph.keys().next().unwrap();
//     let mut current_node = start_node;
//     let mut visited = std::collections::BTreeSet::new();
//     loop {
//         visited.insert(current_node);
//         current_node = match graph.get(current_node) {
//             Some(node) => node,
//             None => break,
//         };
//         if visited.contains(current_node) {
//             break;
//         }
//     }

//     visited.len() == graph.len() && current_node == start_node
// }

// fn solve_hamilton(lit_names: BTreeMap<Lit, String>,solver: &mut rustsat_minisat::core::Minisat){

//     let res = solver.solve().unwrap();
//     if res == SolverResult::Sat{
//         let sol = solver.full_solution().unwrap();
//         let true_lits: Vec<Lit> = lit_names.iter().filter_map(|(lit, _)| if sol[lit.var()] == TernaryVal::True { Some(lit.clone()) } else { None }).collect();
//         let true_lits_names: Vec<&str> = true_lits.iter().map(|lit| lit_names.get(lit).unwrap().as_str()).collect();
//         if check_hamilton(true_lits_names.clone()){
//             println!("{:?}",true_lits_names);
//         }else{
//             // let block_clause:Vec<Lit> = true_lits.iter().map(|&lit|!lit).collect();
//             let mut block_clause = rustsat::types::Clause::new();
//             for lit in true_lits.iter(){
//                 block_clause.add(!*lit);
//             }
//             // let block_clause:rustsat::types::Clause = true_lits.iter().collect();
//             let _ = solver.add_clause(block_clause);
//             solve_hamilton(lit_names,solver)
//         }
//     }else{
//         println!("UNSAT");
//     }

// }
