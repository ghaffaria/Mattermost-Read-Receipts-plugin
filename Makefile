.PHONY: dist clean build-server build-webapp test test-package

dist: build-webapp build-server
	python3 build/package.py

build-webapp:
	cd webapp && npm run check-types && npm run build

build-server:
	mkdir -p .build
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -buildvcs=false -o .build/plugin-linux-amd64 ./server
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -buildvcs=false -o .build/plugin-linux-arm64 ./server
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -buildvcs=false -o .build/healthcheck-linux-amd64 ./build/healthcheck
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -buildvcs=false -o .build/healthcheck-linux-arm64 ./build/healthcheck

test:
	go test -race ./...
	cd webapp && npm test && npm run check-types
	python3 build/test_lab_install.py
	python3 build/test_source.py

test-package:
	python3 build/test_package.py

# Historical releases and mounted runtime artifacts are deliberately preserved.
clean:
	rm -rf .build webapp/dist
