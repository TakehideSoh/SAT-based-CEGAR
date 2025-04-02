FROM ubuntu:22.04

LABEL org.opencontainers.image.version="22.04"
LABEL org.opencontainers.image.ref.name="ubuntu"

ARG LAUNCHPAD_BUILD_ARCH
ARG RELEASE

# パッケージの更新と基本ツールのインストール
RUN apt update && apt -y install \
    curl \
    pkg-config \
    libssl-dev \
    cmake \
    g++ \
    clang \
    libclang-dev \
    cargo

# 環境変数の設定
RUN export LIBCLANG_PATH=/usr/lib/llvm-14/lib

# Rust のインストール
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

# Rust のアップデート
RUN /bin/bash -c "source $HOME/.cargo/env && rustup update"

# 作業ディレクトリを設定
WORKDIR /work

# デフォルトのコマンドを設定
CMD ["/bin/bash"]