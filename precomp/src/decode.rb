#!/usr/bin/env -S ruby -s

# utility for debugging
# (ex.) The last line represents hands.
# echo 410b0029a010003 | ./decode.rb
# echo 410b0029a010003 | ./decode.rb | ./encode.rb -v
# echo 410b0029a010003 | ./decode.rb | ./encode.rb
# echo 'gl.\n.e.\n...\nELG\ncC' | tee /dev/stderr | ./encode.rb | tee /dev/stderr | ./decode.rb

# decode ruleset
# $ ./decode.rb -r val1n
# val1n 11111_01010_10101_00001_10111
# (L_E_G_C_H. H: s=1, se=sw=0, e=w=1, ne=nw=1, n=1)

if $r
  ARGV.each{|s| z = s.each_char.map{|c| c.to_i(32).to_s(2).rjust(5, "0")}.join("_"); puts "#{s} #{z}"}
  exit
end

PIECE = {
  "." => 0,
  "L" => 1,
  "E" => 2,
  "G" => 3,
  "C" => 4,
  "H" => 5,
  "l" => 9,
  "e" => 10,
  "g" => 11,
  "c" => 12,
  "h" => 13,
}.freeze

CODE_TO_PIECE = PIECE.invert.freeze

def decode(hex15)
  s = hex15.to_s.strip
  raise "empty input" if s.empty?
  raise "invalid hex" unless s.match?(/\A[0-9a-fA-F]+\z/)
  v = s.to_i(16)

  # Extract hands (12 bits) from bits [48..59]
  h = (v >> (12 * 4)) & ((1 << 12) - 1)

  hands = {}
  hands["E"] = (h >> 0) & 3
  hands["G"] = (h >> 2) & 3
  hands["C"] = (h >> 4) & 3
  hands["e"] = (h >> 6) & 3
  hands["g"] = (h >> 8) & 3
  hands["c"] = (h >> 10) & 3

  # Extract cells (48 bits) from bits [0..47]
  cells = v & ((1 << (12 * 4)) - 1)

  grid = Array.new(4) { Array.new(3, ".") }

  # i = x*4 + y, y: bottom->top
  (0..2).each do |x|
    (0..3).each do |y|
      i = x * 4 + y
      code = (cells >> (i * 4)) & 0xF
      ch = CODE_TO_PIECE[code]
      raise "unknown code #{code}" unless ch
      grid[3 - y][2 - x] = ch
    end
  end

  board_lines = grid.map { |row| row.join }

  hand_str = +""
  ["E", "G", "C", "e", "g", "c"].each do |k|
    cnt = hands[k] || 0
    hand_str << (k * cnt)
  end

  [board_lines, hands, hand_str]
end

if __FILE__ == $0
  hex = ARGV[0] || STDIN.read
  board_lines, hands, hand_str = decode(hex)

  board_lines.each { |line| puts line }
  puts hand_str
end
