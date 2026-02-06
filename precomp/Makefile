# (ex.) make RULES=val1b

.DELETE_ON_ERROR:

.PHONY: all build clean small large update_rules

all: large

small: unpruned_ai.txt.gz

large: vals.gz

OUT = target/release
LIB = src/board.rs src/board_collection.rs src/lib.rs

PUB = ../client/src/public

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

update_rules:
	echo '$(RULES)' > rules.txt
	(cd ../client/images; ruby setup.rb)

unpruned_ai.txt.gz: 3.txt update_rules
	time ruby -ne 'BEGIN {k = false}; k and puts $$_.split(":")[0]; k = ($$_ !~ /^\s|^$$/) and print $$_.split(/\s+/)[0..1].join(" ")' $< | gzip > $@
	mkdir -p $(PUB); cp $@ $(PUB)/
	rm -f keys.gz vals.gz $(PUB)/keys.gz $(PUB)/vals.gz

2_cooked.txt: 2.txt
	time grep -v '[- ][0-3]$$' $< | time sort > $@

keys.gz: 2_cooked.txt
	time ruby -ne 'STDOUT.write([$$_.split[0].to_i(16)].pack("Q<"))' $< | gzip > $@
	mkdir -p $(PUB); cp $@ $(PUB)/

vals.gz: 2_cooked.txt keys.gz update_rules
	time ruby -ne 'STDOUT.write([$$_.split[1].to_i].pack("C"))' $< | gzip > $@
	mkdir -p $(PUB); cp $@ $(PUB)/
	rm -f unpruned_ai.txt.gz $(PUB)/unpruned_ai.txt.gz
