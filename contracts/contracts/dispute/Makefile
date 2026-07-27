default: build

all: test

test: build
	cargo test

build:
	cargo build --target wasm32-unknown-unknown --release
	cargo build --target wasm32-unknown-unknown --release --profile release-with-logs

fmt:
	cargo fmt --all

clean:
	cargo clean
