# SAT-based-CEGAR
- **cegar-fix**: An HCP solver with in-Rust encoding

## Solvers and Tools Used
- **CaDiCaL** (<https://github.com/arminbiere/cadical> version 1.9.4)  
- **rustsat** (<https://github.com/chrjabs/rustsat> version 0.6.1)

> *You can change the versions of CaDiCaL and rustsat in the `Cargo.toml` file.*


## Build Method

1. **Create and start the container**
    ```bash
    make start-container
    ```

2. **After starting the container, run the following command inside the container to create the executables:**
    ```bash
    make build-all
    ```

3. **Executables will be created at**  
   `src/cegar-fix/target/release/cegar-fix`

4. **The executables are built to run on an Ubuntu 22.04 environment.**


## Execution Method

```bash
./src/cegar-fix/target/release/cegar-fix -i <benchmark> [options]
```


## Options

### cegar-fix

| Option                  | Description                                                |
|-------------------------|------------------------------------------------------------|
| `-i, --input`           | Input file (required)                                     |
| `-o, --output`          | Output folder (optional)                                  |
| `-e, --encoding`        | Select encoding method                                    |
| `-b, --block`           | Select how to add blocking clauses                        |
| `-y, --symmetry`        | Select symmetry-breaking options                          |
| `-t, --two-opt`         | Select 2-opt method option                                |
| `-l, --loop`            | Select loop-forbidding option                             |
| `-n, --normalize`       | Select CNF normalization option                           |
| `-c, --balanced`        | Select the blocking clause balancing option               |
| `-d, --de-arcify`       | Select redundant edge-deletion option                     |
| `-f, --set-configration`| Select CaDiCaL configuration option                       |
| `-r, --degree_order`    | Select clause ordering                                    |
| `-a, --arc_order`       | Select literal numbering order                            |

- **In our experiments, “all” corresponds to the following options**:
  ```bash
  ./src/cegar-fix/target/release/cegar-fix -i <benchmark> -e 1 -b 3 -y 3 -t 3 -l 1
  ```

- **For details on the options**, run:
  ```bash
  ./src/cegar-fix/target/release/cegar-fix -h
  ```

- **If you specify an output folder**, the CNF for each increment will be written to that folder.


## Verifying the Solution

1. Save the solver’s output to a separate file.
2. Run `parse/is_hamiltonian.py`:
    ```bash
    ./src/cegar-ffi/target/release/cegar-ffi -i <benchmark> [Options] > <output>
    ```
    ```bash
    python3 parse/is_hamiltonian.py <benchmark> <output>
    ```

## Log Analysis
The source code for log analysis is in the `parse` folder.

## Experiment Result Logs
<https://cloudkobeu-my.sharepoint.com/:u:/g/personal/239x011x_cloud_kobe-u_jp/EQohsW9CpvFFjVtsGyul9TQB3Zy6lRwwDNfvEawBL8r4Sw?email=soh%40lion.kobe-u.ac.jp&e=KqsmjL>
