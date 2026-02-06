# (ex.) make RULES=val1b

RULES = val1n
PRE = r_$(RULES)

.DELETE_ON_ERROR:

.PHONY: all build clean distclean analyze small large smalldocs largedocs docs update_rules images

all: largedocs

analyze: $(PRE)_2.txt

small: $(PRE)_unpruned_ai.txt.gz

large: $(PRE)_vals.gz

smalldocs: small
	make docs

largedocs: large
	make docs

docs: images
	cd ../client && npm run build

images:
	cd ../client/images && cat ../src/public/rules.txt | xargs ruby setup.rb

OUT = target/release
LIB = src/board.rs src/board_collection.rs src/lib.rs

PUB = ../client/src/public

RULES_OPT = --rules=$(RULES)

build:
	cargo build --release

clean:
	cargo clean
	rm -f r_?????_1.txt r_?????_2.txt r_?????_3.txt r_?????_2_cooked.txt

distclean: clean
	rm -f rules.txt r_?????_unpruned_ai.txt.gz r_?????_keys.gz r_?????_vals.gz

$(OUT)/1-enum: src/1-enum.rs $(LIB) build

$(OUT)/2-analyze: src/2-analyze.rs $(LIB) build

$(OUT)/3-extract: src/3-extract.rs $(LIB) build

$(PRE)_1.txt: $(OUT)/1-enum
	time $< $(RULES_OPT) > $@

$(PRE)_2.txt: $(OUT)/2-analyze $(PRE)_1.txt
	time $< $(RULES_OPT) < $(PRE)_1.txt > $@

$(PRE)_3.txt: $(OUT)/3-extract $(PRE)_2.txt
	time $< $(RULES_OPT) < $(PRE)_2.txt > $@

update_rules:
	mkdir -p $(PUB); echo '$(RULES)' > $(PUB)/rules.txt

$(PRE)_unpruned_ai.txt.gz: $(PRE)_3.txt update_rules
	time ruby -ne 'BEGIN {k = false}; k and puts $$_.split(":")[0]; k = ($$_ !~ /^\s|^$$/) and print $$_.split(/\s+/)[0..1].join(" ")' $< | gzip > $@
	mkdir -p $(PUB); cp $@ $(PUB)/
	rm -f $(PRE)_keys.gz $(PRE)_vals.gz $(PUB)/keys.gz $(PUB)/vals.gz

$(PRE)_2_cooked.txt: $(PRE)_2.txt
	time grep -v '[- ][0-3]$$' $< | time sort > $@

$(PRE)_keys.gz: $(PRE)_2_cooked.txt
	time ruby -ne 'STDOUT.write([$$_.split[0].to_i(16)].pack("Q<"))' $< | gzip > $@
	mkdir -p $(PUB); cp $@ $(PUB)/keys.gz

$(PRE)_vals.gz: $(PRE)_2_cooked.txt $(PRE)_keys.gz update_rules
	time ruby -ne 'STDOUT.write([$$_.split[1].to_i].pack("C"))' $< | gzip > $@
	mkdir -p $(PUB); cp $@ $(PUB)/vals.gz
	rm -f $(PRE)_unpruned_ai.txt.gz $(PUB)/unpruned_ai.txt.gz
