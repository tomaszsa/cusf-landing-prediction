var g_map_object = null;
function init_map() {
        var latlng = new google.maps.LatLng(52, 0);
        var options = {
                zoom: 8,
                center: latlng,
                mapTypeId: google.maps.MapTypeId.TERRAIN
        };
        var map = new google.maps.Map(document.getElementById('map_canvas'), options)
        g_map_object = map;
}

function prediction_entry_convert_date(when) {
        var time = new Date();
        time.setUTCFullYear(when.year);
        time.setUTCMonth(when.month - 1, when.day);
        time.setUTCHours(when.hour);
        time.setUTCMinutes(when.minute);
        time.setUTCSeconds(when.second);
        return time;
}

var g_predictions = { };
function show_prediction(uuid, launch_time, landing_time) {
        if(g_predictions[uuid] != null) { return; }

        $.get('data/' + uuid + '/output.csv', null, function(data, textStatus) {
                var lines = data.split('\n');
                var path = [ ];
                var max_height = -10;
                var max_point = null;
                var idx_final = 0;
                $.each(lines, function(idx, line) {
                        entry = line.split(',');
                        if(entry.length >= 4) {
                                var point = new google.maps.LatLng( parseFloat(entry[1]), parseFloat(entry[2]) );
                                if(parseFloat(entry[3]) > max_height) {
                                        max_height = parseFloat(entry[3]);
                                        max_point = point;
                                }
                                path.push(point);
                                idx_final = idx;
                        }
                });

                // Get launch and landing LatLngs
                var launch_pt = new google.maps.LatLng(parseFloat(lines[0].split(',')[1]),
                        parseFloat(lines[0].split(',')[2]));
                var land_pt = new google.maps.LatLng(parseFloat(lines[idx_final].split(',')[1]), 
                        parseFloat(lines[idx_final].split(',')[2]));

                // Construct a polyline for the flight path
                var path_polyline = new google.maps.Polyline({
                        path: path,
                        strokeColor: '#000000',
                        strokeWeight: 3,
                        strokeOpacity: 0.75
                });
                path_polyline.setMap(g_map_object);

                var pop_icon = new google.maps.MarkerImage('images/pop-marker.png',
                        new google.maps.Size(16, 16),
                        new google.maps.Point(0, 0),
                        new google.maps.Point(8, 8));

                var pop_marker = new google.maps.Marker({
                        position: max_point,
                        map: g_map_object,
                        icon: pop_icon,
                        title: 'Burst (altitude: ' + max_height + 'm)'
                });

                google.maps.event.addListener(path_polyline, 'click', function() { 
                        hide_prediction(uuid);
                });

                google.maps.event.addListener(pop_marker, 'click', function() { 
                        hide_prediction(uuid);
                });

                // Add a row to the prediction table

                var new_row = $(
                'table#trails tbody').append('<tr id="trail-row-' + uuid + '">' +
                '<td>' + launch_time.format('%a %d/%b/%Y') + '</td>' +
                '<td>' + launch_time.format('%H:%M:%S') + '</td>' +
                '<td>' + ((landing_time - launch_time) / (1000*60*60)).toPrecision(3) + ' hrs</td>' +
                '<td>' + distHaversine(launch_pt, land_pt, 1) + ' km</td>' +
                '<td>' + 
                        '<a href="#" onclick="hide_prediction(\''+uuid+'\')">hide</a>&nbsp;' +
                        '<a href="#" onclick="show_info(\''+uuid+'\')">info</a>' +
                '</td>' +
                '</tr>');

                g_predictions[uuid] = { 'polyline': path_polyline, 'row': new_row, 'pop_marker': pop_marker };
                $('#trail_table').fadeIn('normal'); 
        }, 'text');
}

function hide_prediction(uuid) {
        var prediction = g_predictions[uuid];
        if(prediction == null) { return; }

        g_predictions[uuid] = null;

        prediction.polyline.setMap( null );
        prediction.pop_marker.setMap( null );
        
        var table_rows = $('table#trails tr').filter(function() { return this.id.match(/^trail-row-/); });
        var this_row = $('table#trails #trail-row-' + uuid);

        if(table_rows.length > 1) {
                // If there is more than just this row, fade it out
                this_row.fadeOut('normal', function() { this_row.remove(); } );
        } else {
                // fade the whole table.
                $('#trail_table').fadeOut('normal', function() { this_row.remove(); });
        }
}

function show_info(uuid) {
        var map_objects = g_prediction_map_objects[uuid];
        if(map_objects == null) { return; }
        map_objects.info_window.open(g_map_object, map_objects.marker);
}

var g_prediction_map_objects = [];
function populate_map() {
        $.getJSON('data/manifest.json', null, 
        function(data) { 
                // extract the predictions to an array of uuid, entry pairs
                var predictions = [];
                $.each(data['predictions'], function(uuid, entry) { 
                        predictions.push( { 'uuid': uuid, 'entry': entry } );
                });

                // sort the predictions in order of date
                predictions.sort(function(a,b) {
                        var a_date = prediction_entry_convert_date(a.entry['launch-time']);
                        var b_date = prediction_entry_convert_date(b.entry['launch-time']);
                        if(a_date < b_date) { return -1; }
                        if(a_date > b_date) { return 1; }
                        return 0;
                });

                // Add each prediction to the map
                var prediction_coords = [];
                $.each(predictions, function(idx, prediction) {
                        // console.log(prediction);
                        var where = prediction.entry['landing-location'];
                        var launch_time = prediction_entry_convert_date(prediction.entry['launch-time']);
                        var landing_time = prediction_entry_convert_date(prediction.entry['landing-time']);

                        // Derive the index for the greyscale marker image
                        var hour = launch_time.getHours();
                        if( hour > 11 ) hour -= (2*(hour - 12) + 1);
                        
                        var latlng = new google.maps.LatLng(
                                 where.latitude, where.longitude);
                        var marker_image = new google.maps.MarkerImage('images/marker' + hour + ".png",
                                new google.maps.Size(11,11),
                                new google.maps.Point(0,0), // origin
                                new google.maps.Point(5.5,5.5)); // anchor
                        var marker = new google.maps.Marker({
                                 position: latlng,
                                 map: g_map_object,
                                 icon: marker_image,
                                 title: launch_time.format('%a %d/%b/%Y %H:%M:%S')
                        });
                        prediction_coords.push(latlng);

                        var info_window = new google.maps.InfoWindow({
                                content: 
                                        '<p><strong>Launch time:</strong> ' + launch_time.format('%d/%b/%Y %H:%M:%S') + '</p>' +
                                        '<p><strong>Landing time:</strong> ' + landing_time.format('%d/%b/%Y %H:%M:%S') + '</p>' +
                                        '<p><strong>Landing location:</strong> ' + where.latitude + '&deg;N ' + where.longitude + '&deg;E</p>' +
                                        '<p><a target="_new" href="data/' + prediction.uuid + '/">Raw output data</a> (opens in new window)</p>'
                        });

                        google.maps.event.addListener(marker, 'click', function() { 
                                show_prediction(prediction.uuid, launch_time, landing_time);
                        });
                        google.maps.event.addListener(marker, 'rightclick', function() { 
                                info_window.open(g_map_object, marker); 
                        });

                        g_prediction_map_objects[prediction.uuid] = {
                                'info_window': info_window,
                                'marker': marker
                        };
                });

                // Plot a path for the predictions
                var pred_path = new google.maps.Polyline({
                        path: prediction_coords,
                        strokeColor: '#f44',
                        strokeOpacity: 0.5,
                        strokeWeight: 2
                });
                pred_path.setMap(g_map_object);
 
                var template = data['scenario-template'];
                $('#launch-lat').text(template['launch-site'].latitude);
                $('#launch-lon').text(template['launch-site'].longitude);
                $('#launch-alt').text(template['launch-site'].altitude);
                $('#ascent-rate').text(template['altitude-model']['ascent-rate']);
                $('#descent-rate').text(template['altitude-model']['descent-rate']);
                $('#burst-alt').text(template['altitude-model']['burst-altitude']);
                var model = data['model'];
                $('#model-date').text(model['date']);
                $('#model-time').text(model['time']);

                // Pan the map to the scenario centre
                var map_centre = new google.maps.LatLng(template['launch-site'].latitude, 
                        template['launch-site'].longitude);
                g_map_object.panTo(map_centre);
        }
        );
}

function generateLinks(uuid) {
        var html;
        html = '<a target="_new" href="predictions/' + uuid + '/log">log</a>, ';
        html += '<a href="predictions/' + uuid + '/output">output</a>, ';
        html += '<a href="predictions/' + uuid + '/output.kml">KML output</a>';
        return html;
}

function refreshPredictionTable() {
       // Clear any existing pred_table.
       predictions_table.fnClearTable();

       $.getJSON('list.cgi', null, 
       function(data) { 
               $.each(data, function() {
                       predictions_table.fnAddData([ this.creation, this.creation ], false);
               });
               predictions_table.fnDraw();
       }
       );
}

function POSIXtoDate(timestamp)
{
        var d = new Date();
        d.setTime(timestamp * 1000);
        return d.format('%d/%b/%Y %H:%M:%S')
}

/**
 * The Haversine formula to calculate the distance across the surface between
 * two points on the Earth
 */
distHaversine = function(p1, p2, precision) {
  var R = 6371; // earth's mean radius in km
  var dLat  = rad(p2.lat() - p1.lat());
  var dLong = rad(p2.lng() - p1.lng());

  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(rad(p1.lat())) * Math.cos(rad(p2.lat())) * Math.sin(dLong/2) * Math.sin(dLong/2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  var d = R * c;
  if ( precision == null ) {
      return d.toFixed(3);
  } else {
      return d.toFixed(precision);
  }
}

rad = function(x) {return x*Math.PI/180;}

$(document).ready(function() {
        init_map();
        populate_map();
});

// vim:et:ts=8:sw=8:autoindent
