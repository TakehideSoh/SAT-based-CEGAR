# parse

## 解が正確かどうかを確認する
- is_hamiltonian.py
```bash
python3 is_hamiltonian.py <benchmark> <log>
```

## 生ログからcpu時間のcsvを作成する
- log-to-csv.py
```bash
python3 log-to-csv.py <bench_dir> <log_dir> <output_file> <method 1> <method 2> ・・・ <method n>
```
- methodは、`graph??.col.proposed-cegar-2loop-cadical-sinz.time1800.log`のログを取得したい場合、proposed-cegar-2loop-cadical-sinzを入力とする
- colファイルをベンチマークに取った時にのみ対応

## cpu時間のcsvからvbsを追加したcsvを作成する
- add-vbs.py
```bash
python3 cpu_parse.py <input_file> <output_file>
```

## cpu時間のcsvからカクタスプロットを作成する
- cactus-by-csv.py
```bash
python3 cactus-by-csv.py <input_file> <output_file> <method 1> <method 2> ・・・ <method n>
```
- このmethodsは、csvのヘッダーに対応させて、カクタスプロットの凡例に表示させたい名前を入力する
- 例えば、proposed-cegar-cadical-sinz proposed-cegar-2loop-cadical-sinzがcsvのヘッダーにあるとすると、(nohint +2loop)を入力する

## cpu時間のcsvから頂点数ごとの表を作成する
- result_integration.py
```bash
python3 result_integration.py <bench_dir> <input_file> <output_file>
```
