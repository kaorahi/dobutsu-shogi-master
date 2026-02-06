# (ex.) make RULES=val1b

.DELETE_ON_ERROR:

.PHONY: all build check clean

all: unpruned_ai.txt

OUT = target/release
LIB = src/board.rs src/board_collection.rs src/lib.rs

RULES = val1n
RULES_OPT = --rules=$(RULES)

build:
	cargo build --release

clean:
	cargo clean

$(OUT)/1-enum: src/1-enum.rs $(LIB) build

$(OUT)/2-analyze: src/2-analyze.rs $(LIB) build

$(OUT)/3-extract: src/3-extract.rs $(LIB) build

1.txt: $(OUT)/1-enum
	time $< $(RULES_OPT) > $@

2.txt: $(OUT)/2-analyze 1.txt
	time $< $(RULES_OPT) < 1.txt > $@

3.txt: $(OUT)/3-extract 2.txt
	time $< $(RULES_OPT) < 2.txt > $@

unpruned_ai.txt: 3.txt
	echo '#RULES $(RULES)' > $@
	ruby -ne 'BEGIN {k = false}; k and puts $$_.split(":")[0]; k = ($$_ !~ /^\s|^$$/) and print $$_.split(/\s+/)[0..1].join(" ")' $< >> $@
