IMAGE_NAME=my-rust-container
CONTAINER_NAME=rust-container

all: build docker-run build-cegar-fix

start-container: docker-build docker-run

build-all: build-cegar-fix

docker-build:
	docker build -t $(IMAGE_NAME) .

docker-run:
	docker run -it --name $(CONTAINER_NAME) -v $(PWD):/work $(IMAGE_NAME)

build-cardinality:
	cd /work/Cardinality-CDCL && sh build.sh

build-cegar-ffi:
	cd /work/src/cegar-ffi && cargo build --release

build-cegar-fix:
	cd /work/src/cegar-fix && cargo build --release

enter-container:
	docker exec -it $(CONTAINER_NAME) /bin/bash

stop-container:
	docker stop $(CONTAINER_NAME)
	docker rm $(CONTAINER_NAME)

clean:
	cd /work/Cardinality-CDCL && make clean
	cd /work/src/cegar-ffi && cargo clean
	cd /work/src/cegar-fix && cargo clean

clean-all: 
	docker exec $(CONTAINER_NAME) sh -c "cd /work/Cardinality-CDCL && make clean"
	docker exec $(CONTAINER_NAME) sh -c "cd /work/src/cegar-ffi && cargo clean"
	docker exec $(CONTAINER_NAME) sh -c "cd /work/src/cegar-fix && cargo clean"
	docker stop $(CONTAINER_NAME) || true
	docker rm $(CONTAINER_NAME) || true
	docker rmi $(IMAGE_NAME) || true
