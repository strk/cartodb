#!/bin/sh

test -n "$1" || { echo "Usage: $0 <input>" >&2 && exit 1; }

input="$1"

# Retransform if needed
if ! gdalinfo "$input" | grep '^    AUTHORITY'| grep -q '"EPSG","3857"'; then
  echo "Transforming input to webmercator"
  to_wm=`echo "$input" | sed 's/\.\([^\.]*\)/-wm.\\1/'`
  #echo " $input -> $output"
  gdalwarp -t_srs EPSG:3857 "$input" "$to_wm"
  input="$to_wm"
fi

# Align to webmercator quadtree grid if needed
prec=4
z0=156543.03515625
input_scale=`gdalinfo "${input}" | grep '^Pixel Size' | sed 's/.*(\(.*\),.*/\\1/'`
#echo "In scale: ${input_scale}"
input_scale=`echo "scale=${prec}; ${input_scale}/1" | bc`
#echo "In scale (rounded): ${input_scale}"
factor=`echo "scale=10; $z0/$input_scale" | bc`
#echo "Factor: ${factor}"
pow2=`echo "pw=l($factor)/l(2); scale=0; pw/1" | bc -l`
#echo "Pow2: ${pow2}"
out_scale=`echo "scale=10; $z0/(2^$pow2)"| bc`
#echo "Out scale: ${out_scale}"
out_scale=`echo "scale=${prec}; ${out_scale}/1" | bc`
#echo "Out scale (rounded): ${out_scale}"
if test "$input_scale" != "$out_scale"; then
  echo "Rescaling input from $input_scale to $out_scale (for maxzoom ${pow2})"
  to_al=`echo "$input" | sed 's/\.\([^\.]*\)/-al.\\1/'`
  gdalwarp -tr $out_scale -$out_scale "$input" "$to_al"
  input="$to_al"
  input_scale=$out_scale
fi

# Compute overview levels
# Size is 8201, 16424
s=`gdalinfo "${input}" | grep '^Size is ' | sed 's/Size is \(.*\)/\\1/'`
#echo "S:${s}"
w=`echo "${s}" | sed 's/^\([0-9]*\),.*/\\1/'`
#echo "W:${w}"
h=`echo "${s}" | sed 's/.*, \([0-9]*\)/\\1/'`
#echo "H:${h}"
if test "$w" -gt "$h"; then m=$w; else m=$h; fi
#echo "M:${m}"
pow2=`echo "m=l(${m}/256)/l(2)+0.9999; scale=0; m/1" | bc -l`
#echo "P:${pow2}"
f=1
O=''
while [ $f -le $pow2 ]; do
 o=`echo "2^${f}" | bc`
 O="$O,${o}"
 f=$((f+1))
done
O=`echo "${O}" | sed 's/^,/-l /'`
#echo "O: ${O}"

#raster2pgsql -t 128x128 -C -I -Y `./prepare_for_import.sh $input` tabname | psql
echo "$O $input"

